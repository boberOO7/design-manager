-- Optional enum keeps old immutable questionnaire JSON valid without backfilling history.
create or replace function private.validate_feedback_template(p_config jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare q jsonb; k text; expected text; ids text[] := '{}';
begin
 if jsonb_typeof(p_config) <> 'object' or p_config is null
   or (select count(*) from jsonb_object_keys(p_config)) <> (6 + case when p_config ? 'background' then 1 else 0 end)
   or not p_config ?& array['title','subtitle','introduction','thankYou','accent','questions'] then return false; end if;
 if p_config ? 'background' and (jsonb_typeof(p_config->'background') <> 'string' or p_config->>'background' not in ('original','slate','tinted','paper')) then return false; end if;
 foreach k in array array['title','subtitle','introduction','thankYou','accent'] loop
   if jsonb_typeof(p_config->k) <> 'string' then return false; end if;
 end loop;
 if char_length(p_config->>'title')>200 or char_length(p_config->>'subtitle')>1000
   or char_length(p_config->>'introduction')>2000 or char_length(p_config->>'thankYou')>2000
   or (p_config->>'accent') !~ '^#[0-9a-fA-F]{6}$' or jsonb_typeof(p_config->'questions') <> 'array' then return false; end if;
 for q in select value from jsonb_array_elements(p_config->'questions') loop
   if jsonb_typeof(q) <> 'object' or (select count(*) from jsonb_object_keys(q)) <> 6
     or not q ?& array['id','type','label','visible','required','options'] then return false; end if;
   if jsonb_typeof(q->'id') <> 'string' or jsonb_typeof(q->'type') <> 'string' or jsonb_typeof(q->'label') <> 'string'
     or jsonb_typeof(q->'visible') <> 'boolean' or jsonb_typeof(q->'required') <> 'boolean' or jsonb_typeof(q->'options') <> 'array'
     or char_length(q->>'label')>500 or (q->>'id')=any(ids) then return false; end if;
   k := q->>'id'; ids := array_append(ids,k);
   if k = any(array['satisfaction','communication','timeliness','expectations','recommendation','strengths','improvements']) then
     expected := case when k='recommendation' then 'nps' when k in ('strengths','improvements') then 'text' else 'rating' end;
     if q->>'type' <> expected or (q->>'required')::boolean <> (k not in ('strengths','improvements')) then return false; end if;
   elsif k !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or q->>'type' not in ('text','rating','choice') or btrim(q->>'label')='' then return false;
   end if;
   if q->>'type'='choice' then
     if jsonb_array_length(q->'options')<2 or exists (select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o)<>'string' or char_length(o#>>'{}')>200 or btrim(o#>>'{}')='')
       or (select count(distinct btrim(value)) from jsonb_array_elements_text(q->'options')) <> jsonb_array_length(q->'options') then return false; end if;
   elsif jsonb_array_length(q->'options')<>0 then return false;
   end if;
 end loop;
 return ids @> array['satisfaction','communication','timeliness','expectations','recommendation','strengths','improvements'];
end;
$$;
