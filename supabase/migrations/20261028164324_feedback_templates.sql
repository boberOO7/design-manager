-- One studio draft, append-only publications, and invitation-bound response history.
create function private.default_feedback_template() returns jsonb
language sql immutable set search_path = '' as $$
 select jsonb_build_object('title','','subtitle','','introduction','','thankYou','','accent','#e3ca9c',
 'questions', (select jsonb_agg(jsonb_build_object('id',id,'type',case when id='recommendation' then 'nps' when id in ('strengths','improvements') then 'text' else 'rating' end,
 'label','','visible',true,'required',id not in ('strengths','improvements'),'options','[]'::jsonb) order by ord)
 from unnest(array['satisfaction','communication','timeliness','expectations','recommendation','strengths','improvements']) with ordinality q(id,ord)))
$$;
revoke all on function private.default_feedback_template() from public, anon, authenticated;

create function private.validate_feedback_template(p_config jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare q jsonb; k text; expected text; ids text[] := '{}';
begin
 if jsonb_typeof(p_config) <> 'object' or p_config is null
   or (select count(*) from jsonb_object_keys(p_config)) <> 6
   or not p_config ?& array['title','subtitle','introduction','thankYou','accent','questions'] then return false; end if;
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
revoke all on function private.validate_feedback_template(jsonb) from public, anon, authenticated;

create table public.feedback_template_versions (
 id uuid primary key default gen_random_uuid(),
 studio_id uuid not null references public.studios(id) on delete restrict,
 version integer not null check (version>0),
 config jsonb not null check (private.validate_feedback_template(config)),
 studio_name text not null,
 published_at timestamptz not null default now(),
 published_by uuid references public.profiles(id) on delete restrict,
 unique(studio_id,version), unique(id,studio_id)
);
create table public.feedback_templates (
 studio_id uuid primary key references public.studios(id) on delete restrict,
 draft jsonb not null check (private.validate_feedback_template(draft)),
 revision integer not null default 0 check (revision>=0),
 published_version_id uuid not null,
 updated_at timestamptz not null default now(),
 foreign key(published_version_id,studio_id) references public.feedback_template_versions(id,studio_id) on delete restrict
);
alter table public.feedback_template_versions enable row level security;
alter table public.feedback_templates enable row level security;
revoke all on public.feedback_template_versions, public.feedback_templates from public,anon,authenticated;
grant select on public.feedback_template_versions, public.feedback_templates to authenticated;
grant select on public.feedback_template_versions, public.feedback_templates to service_role;
create policy feedback_template_versions_admin_read on public.feedback_template_versions for select to authenticated using (
 (select private.is_studio_admin(studio_id)) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active)
);
create policy feedback_templates_admin_read on public.feedback_templates for select to authenticated using (
 (select private.is_studio_admin(studio_id)) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active)
);
create function private.feedback_version_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'feedback_version_immutable' using errcode='23514'; end;
$$;
revoke all on function private.feedback_version_immutable() from public,anon,authenticated;
create trigger feedback_version_immutable before update or delete on public.feedback_template_versions for each row execute function private.feedback_version_immutable();

-- Existing links and answers use the unchanged default questionnaire, never a later draft.
insert into public.feedback_template_versions(studio_id,version,config,studio_name)
 select id,1,private.default_feedback_template(),name from public.studios;
insert into public.feedback_templates(studio_id,draft,published_version_id)
 select studio_id,config,id from public.feedback_template_versions;
alter table public.project_feedback add column template_version_id uuid,
 add column additional_answers jsonb not null default '{}'::jsonb check(jsonb_typeof(additional_answers)='object');
update public.project_feedback f set template_version_id=v.id from public.feedback_template_versions v where v.studio_id=f.studio_id and v.version=1;
alter table public.project_feedback alter column template_version_id set not null;
alter table public.project_feedback add foreign key(template_version_id,studio_id) references public.feedback_template_versions(id,studio_id) on delete restrict;
alter table public.project_feedback drop constraint project_feedback_complete_response;
alter table public.project_feedback add constraint project_feedback_complete_response check (
 (submitted_at is null and satisfaction is null and communication is null and timeliness is null and expectations is null and recommendation is null and strengths is null and improvements is null and additional_answers='{}'::jsonb)
 or (submitted_at is not null and revoked_at is null)
);
create index project_feedback_version_idx on public.project_feedback(template_version_id,studio_id);

-- Serializes first use, publication and invitation creation within one studio.
create function private.ensure_feedback_template(p_studio_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_name text;
begin
 select name into v_name from public.studios where id=p_studio_id for update;
 if not found then raise exception 'feedback_forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.feedback_templates where studio_id=p_studio_id) then
  insert into public.feedback_template_versions(studio_id,version,config,studio_name) values(p_studio_id,1,private.default_feedback_template(),v_name) returning id into v_id;
  insert into public.feedback_templates(studio_id,draft,published_version_id) values(p_studio_id,private.default_feedback_template(),v_id);
 end if;
end;
$$;
revoke all on function private.ensure_feedback_template(uuid) from public,anon,authenticated;
create function private.feedback_invitation_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  perform private.ensure_feedback_template(new.studio_id);
  if new.template_version_id is null then select published_version_id into new.template_version_id from public.feedback_templates where studio_id=new.studio_id; end if;
 elsif old.submitted_at is not null and new is distinct from old then
  raise exception 'feedback_response_immutable' using errcode='23514';
 elsif (new.studio_id,new.project_id,new.template_version_id,new.token,new.created_at,new.created_by,new.expires_at) is distinct from
       (old.studio_id,old.project_id,old.template_version_id,old.token,old.created_at,old.created_by,old.expires_at) then
  raise exception 'feedback_invitation_immutable' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function private.feedback_invitation_version() from public,anon,authenticated;
create trigger feedback_invitation_version before insert or update on public.project_feedback for each row execute function private.feedback_invitation_version();

create function public.save_feedback_template(p_studio_id uuid,p_config jsonb,p_revision integer,p_publish boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare t public.feedback_templates; v_id uuid; v_number integer;
begin
 if auth.uid() is null or not private.is_studio_admin(p_studio_id) or not exists(select 1 from public.profiles where id=auth.uid() and is_active) then
  raise exception 'feedback_forbidden' using errcode='42501'; end if;
 if not private.validate_feedback_template(p_config) or p_publish is null then raise exception 'feedback_invalid_template' using errcode='22023'; end if;
 perform private.ensure_feedback_template(p_studio_id);
 select * into t from public.feedback_templates where studio_id=p_studio_id for update;
 if p_revision is distinct from t.revision then raise exception 'feedback_draft_conflict' using errcode='40001'; end if;
 v_id:=t.published_version_id;
 if p_publish then
  select max(version)+1 into v_number from public.feedback_template_versions where studio_id=p_studio_id;
  insert into public.feedback_template_versions(studio_id,version,config,studio_name,published_by)
   select p_studio_id,v_number,p_config,name,auth.uid() from public.studios where id=p_studio_id returning id into v_id;
 end if;
 update public.feedback_templates set draft=p_config,revision=revision+1,published_version_id=v_id,updated_at=clock_timestamp() where studio_id=p_studio_id;
 return t.revision+1;
end;
$$;
revoke all on function public.save_feedback_template(uuid,jsonb,integer,boolean) from public,anon,authenticated;
grant execute on function public.save_feedback_template(uuid,jsonb,integer,boolean) to authenticated;

create function private.valid_feedback_answers(p_config jsonb,p_answers jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare q jsonb; a jsonb; k text;
begin
 if p_answers is null or jsonb_typeof(p_answers)<>'object' then return false; end if;
 for k in select jsonb_object_keys(p_answers) loop
  if not exists(select 1 from jsonb_array_elements(p_config->'questions') q where q->>'id'=k and (q->>'visible')::boolean) then return false; end if;
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
revoke all on function private.valid_feedback_answers(jsonb,jsonb) from public,anon,authenticated;
create function public.submit_versioned_feedback(p_token text,p_answers jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare f public.project_feedback; config jsonb;
begin
 select * into f from public.project_feedback where token=p_token and submitted_at is null and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found then return false; end if;
 select v.config into config from public.feedback_template_versions v where v.id=f.template_version_id;
 if not private.valid_feedback_answers(config,p_answers) then raise exception 'feedback_invalid_response' using errcode='22023'; end if;
 update public.project_feedback set submitted_at=clock_timestamp(),
 satisfaction=(p_answers->>'satisfaction')::smallint,communication=(p_answers->>'communication')::smallint,
 timeliness=(p_answers->>'timeliness')::smallint,expectations=(p_answers->>'expectations')::smallint,recommendation=(p_answers->>'recommendation')::smallint,
 strengths=nullif(btrim(p_answers->>'strengths'),''),improvements=nullif(btrim(p_answers->>'improvements'),''),
 additional_answers=p_answers-array['satisfaction','communication','timeliness','expectations','recommendation','strengths','improvements'] where id=f.id;
 return true;
end;
$$;
revoke all on function public.submit_versioned_feedback(text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_versioned_feedback(text,jsonb) to service_role;
-- Retain the old signature for already-loaded forms and legacy integration callers.
create or replace function public.submit_project_feedback(p_token text,p_satisfaction integer,p_communication integer,p_timeliness integer,p_expectations integer,p_recommendation integer,p_strengths text,p_improvements text)
returns boolean language sql security invoker set search_path='' as $$
 select public.submit_versioned_feedback(p_token,jsonb_build_object('satisfaction',p_satisfaction,'communication',p_communication,'timeliness',p_timeliness,'expectations',p_expectations,'recommendation',p_recommendation,'strengths',coalesce(btrim(p_strengths),''),'improvements',coalesce(btrim(p_improvements),'')))
$$;

-- Date filters select an invitation cohort, so response rate always uses the same denominator.
create function public.get_feedback_analytics(p_studio_id uuid,p_from timestamptz default null,p_to timestamptz default null,p_project_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with cohort as materialized (
  select * from public.project_feedback f where f.studio_id=p_studio_id
   and (p_from is null or f.created_at>=p_from) and (p_to is null or f.created_at<p_to) and (p_project_id is null or f.project_id=p_project_id)
 ), summaries as (
  select to_char(date_trunc('month',submitted_at at time zone 'Europe/Kyiv'),'YYYY-MM') period,
   count(*) responses,avg(satisfaction) satisfaction,avg(communication) communication,avg(timeliness) timeliness,avg(expectations) expectations,avg(recommendation) recommendation,
   100.0*(count(*) filter(where recommendation>=9)-count(*) filter(where recommendation<=6))/nullif(count(recommendation),0) nps
  from cohort where submitted_at is not null group by grouping sets((),(date_trunc('month',submitted_at at time zone 'Europe/Kyiv')))
 ), custom as (
  select v.id version_id,v.version,q.value question,
   count(*) filter(where f.additional_answers->>(q.value->>'id') is not null and f.additional_answers->>(q.value->>'id')<>'') responses,
   avg(case when q.value->>'type'='rating' then (f.additional_answers->>(q.value->>'id'))::numeric end) average,
   coalesce((select jsonb_object_agg(option,(select count(*) from cohort c where c.template_version_id=v.id and c.submitted_at is not null and c.additional_answers->>(q.value->>'id')=option)) from jsonb_array_elements_text(q.value->'options') option),'{}'::jsonb) distribution,
   coalesce(jsonb_agg(jsonb_build_object('text',f.additional_answers->>(q.value->>'id'),'submittedAt',f.submitted_at,'projectId',f.project_id) order by f.submitted_at desc,f.id) filter(where q.value->>'type'='text' and nullif(f.additional_answers->>(q.value->>'id'),'') is not null),'[]'::jsonb) texts
  from cohort f join public.feedback_template_versions v on v.id=f.template_version_id
   cross join lateral jsonb_array_elements(v.config->'questions') q
  where f.submitted_at is not null and (q.value->>'visible')::boolean and q.value->>'id' not in ('satisfaction','communication','timeliness','expectations','recommendation','strengths','improvements')
  group by v.id,v.version,q.value
 ) select jsonb_build_object('invitations',(select count(*) from cohort),'summary',(select coalesce(jsonb_agg(to_jsonb(s) order by s.period desc nulls first),'[]'::jsonb) from summaries s),
 'additional',(select coalesce(jsonb_agg(to_jsonb(c) order by c.version,c.question->>'id'),'[]'::jsonb) from custom c))
$$;
revoke all on function public.get_feedback_analytics(uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.get_feedback_analytics(uuid,timestamptz,timestamptz,uuid) to authenticated;
-- Correct the legacy aggregate denominator when recommendation is hidden in a new version.
create or replace function public.get_studio_feedback_summary(p_studio_id uuid)
returns table(period text,responses bigint,satisfaction numeric,communication numeric,timeliness numeric,expectations numeric,recommendation numeric,nps numeric)
language sql stable security invoker set search_path='' as $$
 select to_char(date_trunc('month',f.submitted_at at time zone 'UTC'),'YYYY-MM'),count(*),round(avg(f.satisfaction),2),round(avg(f.communication),2),round(avg(f.timeliness),2),round(avg(f.expectations),2),round(avg(f.recommendation),2),
 round(100.0*(count(*) filter(where f.recommendation>=9)-count(*) filter(where f.recommendation<=6))/nullif(count(f.recommendation),0),1)
 from public.project_feedback f where f.studio_id=p_studio_id and f.submitted_at is not null
 group by grouping sets((),(date_trunc('month',f.submitted_at at time zone 'UTC'))) order by 1 desc nulls first
$$;
