-- Keep bearer invitations reusable; each submission is a separate immutable response.
create table public.project_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.project_feedback(id) on delete cascade,
  submitted_at timestamptz not null default clock_timestamp(),
  satisfaction smallint check (satisfaction between 1 and 5),
  communication smallint check (communication between 1 and 5),
  timeliness smallint check (timeliness between 1 and 5),
  expectations smallint check (expectations between 1 and 5),
  recommendation smallint check (recommendation between 0 and 10),
  strengths text check (char_length(strengths) <= 2000),
  improvements text check (char_length(improvements) <= 2000),
  additional_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(additional_answers) = 'object')
);
create index project_feedback_responses_invitation_idx on public.project_feedback_responses(invitation_id, submitted_at desc, id);
alter table public.project_feedback_responses enable row level security;
revoke all on public.project_feedback_responses from public, anon, authenticated;
grant select on public.project_feedback_responses to authenticated;
grant all on public.project_feedback_responses to service_role;
-- The parent invitation's RLS enforces active studio admin/profile access.
create policy project_feedback_responses_admin_read on public.project_feedback_responses
  for select to authenticated using (
    exists (select 1 from public.project_feedback f where f.id = invitation_id)
  );

-- Preserve existing answers, timestamps, invitation IDs, tokens and questionnaire versions.
insert into public.project_feedback_responses(id, invitation_id, submitted_at,
  satisfaction, communication, timeliness, expectations, recommendation, strengths, improvements, additional_answers)
select id, id, submitted_at, satisfaction, communication, timeliness, expectations,
  recommendation, strengths, improvements, additional_answers
from public.project_feedback where submitted_at is not null;

create function private.feedback_response_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'feedback_response_immutable' using errcode = '23514';
end;
$$;
revoke all on function private.feedback_response_immutable() from public, anon, authenticated;
create trigger feedback_response_immutable before update on public.project_feedback_responses
  for each row execute function private.feedback_response_immutable();

create or replace function private.feedback_invitation_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.ensure_feedback_template(new.studio_id);
    if new.template_version_id is null then
      select published_version_id into new.template_version_id from public.feedback_templates where studio_id = new.studio_id;
    end if;
  elsif (new.studio_id, new.project_id, new.template_version_id, new.token, new.created_at, new.created_by, new.expires_at)
    is distinct from (old.studio_id, old.project_id, old.template_version_id, old.token, old.created_at, old.created_by, old.expires_at) then
    raise exception 'feedback_invitation_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter table public.project_feedback drop constraint project_feedback_complete_response,
  drop column submitted_at, drop column satisfaction, drop column communication,
  drop column timeliness, drop column expectations, drop column recommendation,
  drop column strengths, drop column improvements, drop column additional_answers;

create or replace function public.revoke_project_feedback(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.project_feedback f join public.profiles p on p.id = auth.uid() and p.is_active
    where f.id = p_invitation_id and private.is_studio_admin(f.studio_id)
  ) then raise exception 'feedback_forbidden' using errcode = '42501'; end if;
  update public.project_feedback set revoked_at = clock_timestamp()
  where id = p_invitation_id and revoked_at is null;
end;
$$;

create or replace function public.submit_versioned_feedback(p_token text, p_answers jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare f public.project_feedback; config jsonb;
begin
  -- Serialize with revocation; a completed response never consumes the invitation.
  select * into f from public.project_feedback
    where token = p_token and revoked_at is null and expires_at > clock_timestamp() for update;
  if not found then return false; end if;
  select v.config into config from public.feedback_template_versions v where v.id = f.template_version_id;
  if not private.valid_feedback_answers(config, p_answers) then
    raise exception 'feedback_invalid_response' using errcode = '22023';
  end if;
  insert into public.project_feedback_responses(invitation_id, satisfaction, communication,
    timeliness, expectations, recommendation, strengths, improvements, additional_answers)
  values (f.id, (p_answers->>'satisfaction')::smallint, (p_answers->>'communication')::smallint,
    (p_answers->>'timeliness')::smallint, (p_answers->>'expectations')::smallint, (p_answers->>'recommendation')::smallint,
    nullif(btrim(p_answers->>'strengths'), ''), nullif(btrim(p_answers->>'improvements'), ''),
    p_answers - array['satisfaction','communication','timeliness','expectations','recommendation','strengths','improvements']);
  return true;
end;
$$;

create or replace function public.get_feedback_analytics(p_studio_id uuid,p_from timestamptz default null,p_to timestamptz default null,p_project_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with invitations as materialized (
  select * from public.project_feedback f where f.studio_id=p_studio_id
   and (p_from is null or f.created_at>=p_from) and (p_to is null or f.created_at<p_to) and (p_project_id is null or f.project_id=p_project_id)
 ), cohort as materialized (
  select r.*, f.studio_id, f.project_id, f.template_version_id
  from invitations f join public.project_feedback_responses r on r.invitation_id=f.id
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
 ) select jsonb_build_object('invitations',(select count(*) from invitations),'answeredInvitations',(select count(distinct invitation_id) from cohort),'summary',(select coalesce(jsonb_agg(to_jsonb(s) order by s.period desc nulls first),'[]'::jsonb) from summaries s),
 'additional',(select coalesce(jsonb_agg(to_jsonb(c) order by c.version,c.question->>'id'),'[]'::jsonb) from custom c))
$$;

create or replace function public.get_studio_feedback_summary(p_studio_id uuid)
returns table(period text,responses bigint,satisfaction numeric,communication numeric,timeliness numeric,expectations numeric,recommendation numeric,nps numeric)
language sql stable security invoker set search_path='' as $$
 select to_char(date_trunc('month',f.submitted_at at time zone 'UTC'),'YYYY-MM'),count(*),round(avg(f.satisfaction),2),round(avg(f.communication),2),round(avg(f.timeliness),2),round(avg(f.expectations),2),round(avg(f.recommendation),2),
 round(100.0*(count(*) filter(where f.recommendation>=9)-count(*) filter(where f.recommendation<=6))/nullif(count(f.recommendation),0),1)
 from public.project_feedback i join public.project_feedback_responses f on f.invitation_id=i.id where i.studio_id=p_studio_id
 group by grouping sets((),(date_trunc('month',f.submitted_at at time zone 'UTC'))) order by 1 desc nulls first
$$;
