-- Invitations and immutable responses share a row: consuming a link is one atomic update.
create table public.project_feedback (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  project_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (isfinite(expires_at)),
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex') check (token ~ '^[a-f0-9]{64}$'),
  revoked_at timestamptz,
  submitted_at timestamptz,
  satisfaction smallint check (satisfaction between 1 and 5),
  communication smallint check (communication between 1 and 5),
  timeliness smallint check (timeliness between 1 and 5),
  expectations smallint check (expectations between 1 and 5),
  recommendation smallint check (recommendation between 0 and 10),
  strengths text check (char_length(strengths) <= 2000),
  improvements text check (char_length(improvements) <= 2000),
  foreign key (project_id, studio_id) references public.projects(id, studio_id) on delete cascade,
  constraint project_feedback_complete_response check (
    (submitted_at is null and satisfaction is null and communication is null and timeliness is null and expectations is null and recommendation is null and strengths is null and improvements is null)
    or (submitted_at is not null and satisfaction is not null and communication is not null and timeliness is not null and expectations is not null and recommendation is not null and revoked_at is null)
  )
);
create index project_feedback_project_idx on public.project_feedback(studio_id, project_id, created_at desc, id);
create index project_feedback_analytics_idx on public.project_feedback(studio_id, submitted_at) where submitted_at is not null;
alter table public.project_feedback enable row level security;
revoke all on public.project_feedback from public, anon, authenticated;
grant select on public.project_feedback to authenticated;
grant all on public.project_feedback to service_role;
create policy project_feedback_admin_read on public.project_feedback for select to authenticated using (
  (select private.is_studio_admin(studio_id))
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active)
);

create function public.create_project_feedback(p_project_id uuid, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_studio uuid; v_id uuid;
begin
  select studio_id into v_studio from public.projects where id = p_project_id;
  if auth.uid() is null or v_studio is null or not private.is_studio_admin(v_studio)
    or not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'feedback_forbidden' using errcode = '42501';
  end if;
  if p_expires_at is null or not isfinite(p_expires_at) or p_expires_at <= clock_timestamp() then
    raise exception 'feedback_invalid_expiry' using errcode = '22023';
  end if;
  insert into public.project_feedback(studio_id, project_id, created_by, expires_at)
  values (v_studio, p_project_id, auth.uid(), p_expires_at) returning id into v_id;
  return v_id;
end;
$$;
create function public.revoke_project_feedback(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.project_feedback f join public.profiles p on p.id = auth.uid() and p.is_active
    where f.id = p_invitation_id and private.is_studio_admin(f.studio_id)
  ) then raise exception 'feedback_forbidden' using errcode = '42501'; end if;
  update public.project_feedback set revoked_at = clock_timestamp()
  where id = p_invitation_id and submitted_at is null and revoked_at is null;
end;
$$;

-- Only the server may use this capability endpoint; no anonymous Data API access.
-- The token alone determines studio/project. No caller-supplied IDs are accepted.
create function public.submit_project_feedback(
  p_token text, p_satisfaction integer, p_communication integer, p_timeliness integer,
  p_expectations integer, p_recommendation integer, p_strengths text, p_improvements text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$'
    or p_satisfaction is null or p_satisfaction not between 1 and 5
    or p_communication is null or p_communication not between 1 and 5
    or p_timeliness is null or p_timeliness not between 1 and 5
    or p_expectations is null or p_expectations not between 1 and 5
    or p_recommendation is null or p_recommendation not between 0 and 10
    or char_length(p_strengths) > 2000 or char_length(p_improvements) > 2000 then
    raise exception 'feedback_invalid_response' using errcode = '22023';
  end if;
  update public.project_feedback set
    satisfaction = p_satisfaction, communication = p_communication, timeliness = p_timeliness,
    expectations = p_expectations, recommendation = p_recommendation,
    strengths = nullif(btrim(p_strengths), ''), improvements = nullif(btrim(p_improvements), ''),
    submitted_at = clock_timestamp()
  where token = p_token and submitted_at is null and revoked_at is null and expires_at > clock_timestamp();
  return found;
end;
$$;

-- Aggregate in Postgres; neither raw responses nor tokens leave the analytics query.
create function public.get_studio_feedback_summary(p_studio_id uuid)
returns table(period text, responses bigint, satisfaction numeric, communication numeric,
  timeliness numeric, expectations numeric, recommendation numeric, nps numeric)
language sql stable security invoker set search_path = '' as $$
  select to_char(date_trunc('month', f.submitted_at at time zone 'UTC'), 'YYYY-MM'), count(*),
    round(avg(f.satisfaction), 2), round(avg(f.communication), 2), round(avg(f.timeliness), 2),
    round(avg(f.expectations), 2), round(avg(f.recommendation), 2),
    round(100.0 * (count(*) filter (where f.recommendation >= 9) - count(*) filter (where f.recommendation <= 6)) / nullif(count(*), 0), 1)
  from public.project_feedback f where f.studio_id = p_studio_id and f.submitted_at is not null
  group by grouping sets ((), (date_trunc('month', f.submitted_at at time zone 'UTC')))
  order by 1 desc nulls first;
$$;
revoke all on function public.create_project_feedback(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_project_feedback(uuid) from public, anon, authenticated;
revoke all on function public.submit_project_feedback(text, integer, integer, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.get_studio_feedback_summary(uuid) from public, anon, authenticated;
grant execute on function public.create_project_feedback(uuid, timestamptz), public.revoke_project_feedback(uuid), public.get_studio_feedback_summary(uuid) to authenticated;
grant execute on function public.submit_project_feedback(text, integer, integer, integer, integer, integer, text, text) to service_role;
