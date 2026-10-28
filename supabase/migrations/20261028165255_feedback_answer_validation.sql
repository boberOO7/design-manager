-- Qualify the JSON element independently of the local question variable.
create or replace function private.valid_feedback_answers(p_config jsonb,p_answers jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare q jsonb; a jsonb; k text;
begin
 if p_answers is null or jsonb_typeof(p_answers)<>'object' then return false; end if;
 for k in select jsonb_object_keys(p_answers) loop
  if not exists(select 1 from jsonb_array_elements(p_config->'questions') item where item.value->>'id'=k and (item.value->>'visible')::boolean) then return false; end if;
 end loop;
 for q in select value from jsonb_array_elements(p_config->'questions') where (value->>'visible')::boolean loop
  a:=p_answers->(q->>'id');
  if a is null or a='null'::jsonb or a='""'::jsonb then
   if (q->>'required')::boolean then return false; end if;
   continue;
  end if;
  case q->>'type'
   when 'text' then if jsonb_typeof(a)<>'string' or char_length(a#>>'{}')>2000 then return false; end if;
   when 'choice' then if jsonb_typeof(a)<>'string' or not (q->'options' @> jsonb_build_array(a)) then return false; end if;
   else
    if jsonb_typeof(a)<>'number' then return false; end if;
    if (a#>>'{}')::numeric<>trunc((a#>>'{}')::numeric) or (a#>>'{}')::numeric < (case when q->>'type'='nps' then 0 else 1 end)
      or (a#>>'{}')::numeric > (case when q->>'type'='nps' then 10 else 5 end) then return false; end if;
  end case;
 end loop;
 return true;
end;
$$;
