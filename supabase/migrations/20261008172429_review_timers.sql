-- Sessions use server instants; membership and completed intervals are immutable history.
create table public.review_timer_sessions (
  id uuid primary key,
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  state text not null check (state in ('active','paused','completed')),
  started_at timestamptz not null default clock_timestamp(),
  running_since timestamptz,
  accounted_at timestamptz,
  elapsed_us bigint not null default 0 check (elapsed_us >= 0),
  paused_at timestamptz,
  check ((state = 'active') = (running_since is not null)),
  check ((state = 'active') = (accounted_at is not null))
);
create unique index review_timer_one_active_user on public.review_timer_sessions(user_id) where state = 'active';
create index review_timer_user_history on public.review_timer_sessions(user_id, started_at desc);
create table public.review_timer_members (
  session_id uuid not null references public.review_timer_sessions(id) on delete cascade,
  round_id uuid not null references public.task_review_rounds(id) on delete restrict,
  finished_at timestamptz,
  primary key (session_id, round_id)
);
create index review_timer_members_round on public.review_timer_members(round_id);
create table public.review_timer_intervals (
  session_id uuid primary key references public.review_timer_sessions(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
-- Exact carry and automatic-minute baseline are separate from editable Work Log totals.
create table public.review_timer_daily (
  user_id uuid not null references public.profiles(id) on delete restrict,
  studio_id uuid not null references public.studios(id) on delete cascade,
  round_id uuid not null references public.task_review_rounds(id) on delete restrict,
  work_date date not null,
  elapsed_us bigint not null default 0 check (elapsed_us >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  carry_minutes integer not null default 0 check (carry_minutes >= 0 and carry_minutes <= minutes),
  primary key (user_id, work_date, round_id)
);
create index review_timer_daily_round on public.review_timer_daily(round_id);
create index review_timer_daily_studio on public.review_timer_daily(studio_id, work_date);

-- Fixed memberships own their rounding carry, so another review cannot take group minutes.
create table public.review_timer_buckets (
  user_id uuid not null references public.profiles(id) on delete restrict,
  studio_id uuid not null references public.studios(id) on delete cascade,
  membership_key text not null,
  round_ids uuid[] not null check (cardinality(round_ids) > 0),
  work_date date not null,
  elapsed_us bigint not null default 0 check (elapsed_us >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  allocation jsonb not null default '{}'::jsonb check (jsonb_typeof(allocation) = 'object'),
  primary key (user_id, membership_key, work_date)
);
alter table public.review_timer_buckets enable row level security;
revoke all on public.review_timer_buckets from public,anon,authenticated;
grant select on public.review_timer_buckets to authenticated;
grant all on public.review_timer_buckets to service_role;
create policy review_timer_buckets_read on public.review_timer_buckets for select to authenticated
using ((select private.is_studio_member(studio_id)) and (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id))));

alter table public.review_timer_sessions enable row level security;
alter table public.review_timer_members enable row level security;
alter table public.review_timer_intervals enable row level security;
alter table public.review_timer_daily enable row level security;
revoke all on public.review_timer_sessions, public.review_timer_members, public.review_timer_intervals, public.review_timer_daily from public, anon, authenticated;
grant select on public.review_timer_sessions, public.review_timer_members, public.review_timer_intervals, public.review_timer_daily to authenticated;
grant all on public.review_timer_sessions, public.review_timer_members, public.review_timer_intervals, public.review_timer_daily to service_role;
create policy review_timer_sessions_read on public.review_timer_sessions for select to authenticated
using ((select private.is_studio_member(studio_id)) and (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id))));
create policy review_timer_members_read on public.review_timer_members for select to authenticated
using (exists (select 1 from public.review_timer_sessions s where s.id = session_id));
create policy review_timer_intervals_read on public.review_timer_intervals for select to authenticated
using (exists (select 1 from public.review_timer_sessions s where s.id = session_id));
create policy review_timer_daily_read on public.review_timer_daily for select to authenticated
using ((select private.is_studio_member(studio_id)) and (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id))));

create function private.review_timer_lock(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review-timer:' || p_user::text, 0));
$$;
revoke all on function private.review_timer_lock(uuid) from public, anon, authenticated;

-- Caller holds the user lock. Checkpoints can be retried without replaying an interval.
create function private.account_review_timer(p_session uuid, p_until timestamptz, p_pause boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.review_timer_sessions%rowtype;
  cursor_at timestamptz;
  boundary timestamptz;
  day date;
  micros bigint;
  member_count integer;
  member_ids uuid[];
  member_key text;
  award uuid;
  award_day date;
  remaining bigint;
  previous_minutes bigint;
  carry_day date;
  available bigint;
begin
  select * into s from public.review_timer_sessions where id = p_session for update;
  if not found or s.state <> 'active' then return; end if;
  cursor_at := s.accounted_at;
  p_until := greatest(cursor_at, p_until);
  select count(*),array_agg(round_id order by round_id) into member_count,member_ids from public.review_timer_members where session_id = s.id;
  member_key := encode(sha256(convert_to(array_to_string(member_ids,','),'UTF8')),'hex');
  while cursor_at < p_until loop
    day := (cursor_at at time zone 'Europe/Kyiv')::date;
    boundary := least(p_until, ((day + 1)::timestamp at time zone 'Europe/Kyiv'));
    micros := floor(extract(epoch from boundary - cursor_at) * 1000000)::bigint;
    insert into public.review_timer_daily(user_id, studio_id, round_id, work_date, elapsed_us)
    select s.user_id, s.studio_id, m.round_id, day,
      micros / member_count + case when row_number() over(order by m.round_id) <= micros % member_count then 1 else 0 end
    from public.review_timer_members m where m.session_id = s.id
    on conflict (user_id, work_date, round_id) do update set elapsed_us = review_timer_daily.elapsed_us + excluded.elapsed_us;
    insert into public.review_timer_buckets(user_id,studio_id,membership_key,round_ids,work_date,elapsed_us)
      values(s.user_id,s.studio_id,member_key,member_ids,day,micros)
      on conflict (user_id,membership_key,work_date) do update set elapsed_us=review_timer_buckets.elapsed_us+excluded.elapsed_us;
    -- This membership's own whole minutes remain conserved independently of prior work.
    select greatest(0,floor(sum(b.elapsed_us)::numeric/60000000)::bigint-sum(b.minutes)),sum(b.minutes)
      into remaining,previous_minutes from public.review_timer_buckets b
      where b.user_id=s.user_id and b.studio_id=s.studio_id and b.membership_key=member_key;
    while remaining > 0 loop
      award := member_ids[(previous_minutes % member_count)::integer + 1];
      select d.work_date into carry_day from public.review_timer_daily d
        where d.user_id=s.user_id and d.studio_id=s.studio_id and d.round_id=award and d.carry_minutes>0
        order by d.work_date desc limit 1;
      update public.review_timer_buckets b set minutes=minutes+1,
        allocation=jsonb_set(allocation,array[award::text],to_jsonb(coalesce((allocation->>award::text)::integer,0)+1))
        where b.user_id=s.user_id and b.studio_id=s.studio_id and b.membership_key=member_key and b.work_date=day;
      if carry_day is not null then
        -- Reclassify an already posted precision carry instead of posting it twice.
        update public.review_timer_daily set carry_minutes=carry_minutes-1
          where user_id=s.user_id and studio_id=s.studio_id and round_id=award and work_date=carry_day;
      else
        select greatest(0,floor(sum(d.elapsed_us)::numeric/60000000)::bigint-sum(d.minutes)) into available
          from public.review_timer_daily d where d.user_id=s.user_id and d.studio_id=s.studio_id;
        if available > 0 then
        select d.work_date into award_day from public.review_timer_daily d
          where d.user_id=s.user_id and d.studio_id=s.studio_id and d.round_id=award
          order by d.elapsed_us-d.minutes::bigint*60000000 desc,d.work_date desc limit 1;
        update public.review_timer_daily set minutes=minutes+1 where user_id=s.user_id and studio_id=s.studio_id and work_date=award_day and round_id=award;
        insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,review_round_id,minutes)
        select s.studio_id,s.user_id,award_day,'review',r.task_id,r.id,1 from public.task_review_rounds r where r.id=award
        on conflict (user_id,work_date,task_id,review_round_id) do update set minutes=work_log_entries.minutes+1,updated_at=clock_timestamp();
        end if;
      end if;
      remaining:=remaining-1;
      previous_minutes:=previous_minutes+1;
    end loop;
    -- Global residuals preserve short completed reviews without charging group totals.
    select greatest(0,floor(sum(d.elapsed_us)::numeric/60000000)::bigint-sum(d.minutes)) into remaining
      from public.review_timer_daily d where d.user_id=s.user_id and d.studio_id=s.studio_id;
    while remaining > 0 loop
      select d.round_id,d.work_date into award,award_day from public.review_timer_daily d
        where d.user_id=s.user_id and d.studio_id=s.studio_id
        order by d.elapsed_us-d.minutes::bigint*60000000 desc,d.round_id,d.work_date desc limit 1;
      update public.review_timer_daily set minutes=minutes+1,carry_minutes=carry_minutes+1
        where user_id=s.user_id and studio_id=s.studio_id and work_date=award_day and round_id=award;
      insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,review_round_id,minutes)
      select s.studio_id,s.user_id,award_day,'review',r.task_id,r.id,1 from public.task_review_rounds r where r.id=award
      on conflict (user_id,work_date,task_id,review_round_id) do update set minutes=work_log_entries.minutes+1,updated_at=clock_timestamp();
      remaining:=remaining-1;
    end loop;
    cursor_at := boundary;
  end loop;
  update public.review_timer_sessions set elapsed_us = elapsed_us + floor(extract(epoch from p_until - s.accounted_at) * 1000000)::bigint,
    accounted_at = case when p_pause then null else p_until end,
    running_since = case when p_pause then null else running_since end,
    state = case when p_pause then 'paused' else state end,
    paused_at = case when p_pause then p_until else paused_at end where id = s.id;
  if p_pause then update public.review_timer_intervals set ended_at = p_until where session_id = s.id; end if;
end;
$$;
revoke all on function private.account_review_timer(uuid,timestamptz,boolean) from public,anon,authenticated;

create function public.control_review_timer(p_action text, p_session_id uuid default null, p_round_ids uuid[] default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  studio uuid;
  active_id uuid;
  requested uuid[];
  group_project uuid;
  group_stage text;
  instant timestamptz;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id=sm.user_id
      where sm.user_id=actor and sm.is_active and p.is_active) <> 1 then raise exception 'An active studio membership is required'; end if;
  if p_action='start' then
    -- Project revocation takes this resource lock before reviewer locks.
    perform 1 from public.projects p join public.tasks t on t.project_id=p.id join public.task_review_rounds r on r.task_id=t.id
      where r.id=any(p_round_ids) order by p.id for share of p;
  end if;
  perform private.review_timer_lock(actor);
  -- Permissions may have changed while this request waited for a concurrent action.
  if (select count(*) from public.studio_members sm join public.profiles profile on profile.id=sm.user_id
    where sm.user_id=actor and sm.is_active and profile.is_active)<>1 then raise exception 'An active studio membership is required'; end if;
  select studio_id into studio from public.studio_members where user_id=actor and is_active;
  instant := clock_timestamp();
  select id into active_id from public.review_timer_sessions where user_id=actor and state='active';
  if p_action = 'sync' then
    if active_id is not null then
      perform private.account_review_timer(active_id,instant,exists(select 1 from public.review_timer_sessions where id=active_id and studio_id<>studio)
        or exists(select 1 from public.review_timer_members m join public.task_review_rounds r on r.id=m.round_id
          join public.tasks t on t.id=r.task_id join public.projects p on p.id=t.project_id
          where m.session_id=active_id and (r.completed_at is not null or r.reviewer_id<>actor or t.status<>'internal_review'
            or not coalesce(private.can_access_project(p.id),false) or p.archived_at is not null or p.status='archived'
            or (p.status='completed' and private.is_project_progress_stage(t.stage)))));
      if not exists(select 1 from public.review_timer_sessions where id=active_id and state='active') then return null; end if;
    end if;
    return active_id;
  elsif p_action = 'pause' then
    if not exists(select 1 from public.review_timer_sessions where id=p_session_id and user_id=actor) then
      raise exception 'Timer unavailable'; end if;
    perform private.account_review_timer(p_session_id,instant,true);
    return p_session_id;
  elsif p_action = 'start' then
    if p_session_id is null then raise exception 'A session ID is required'; end if;
    if exists(select 1 from public.review_timer_sessions where id=p_session_id and user_id=actor and studio_id=studio) then return p_session_id; end if;
    if active_id is not null then raise exception 'Pause your active review timer before starting another'; end if;
    requested := array(select distinct id from unnest(p_round_ids) id order by id);
    if coalesce(cardinality(requested),0)=0 or cardinality(requested)<>cardinality(p_round_ids) then raise exception 'Choose unique review rounds'; end if;
    if exists(select 1 from unnest(requested) chosen(round_id) where not exists (
      select 1 from public.task_review_rounds r join public.tasks t on t.id=r.task_id join public.projects p on p.id=t.project_id
      join public.task_review_round_reviewers rr on rr.round_id=r.id and rr.reviewer_id=actor
      where r.id=chosen.round_id and r.reviewer_id=actor and r.completed_at is null and rr.approved_at is null
        and t.status='internal_review' and p.studio_id=studio and private.can_access_project(p.id)
        and p.archived_at is null and p.status<>'archived' and (p.status<>'completed' or not private.is_project_progress_stage(t.stage))
    )) then raise exception 'Only the current assigned reviewer can start an unfinished review'; end if;
    select t.project_id,t.stage into group_project,group_stage from public.tasks t join public.task_review_rounds r on r.task_id=t.id where r.id=requested[1];
    if exists(select 1 from public.tasks t join public.task_review_rounds r on r.task_id=t.id where r.id=any(requested)
      and (t.project_id<>group_project or t.stage<>group_stage)) then raise exception 'A shared timer requires one project and stage'; end if;
    -- Resuming creates a fresh interval ID. A retried old Start cannot restart time.
    update public.review_timer_sessions s set state='completed' where s.user_id=actor and s.state='paused'
      and exists(select 1 from public.review_timer_members m where m.session_id=s.id and m.round_id=any(requested));
    insert into public.review_timer_sessions(id,studio_id,user_id,state,started_at,running_since,accounted_at)
      values(p_session_id,studio,actor,'active',instant,instant,instant);
    insert into public.review_timer_members(session_id,round_id) select p_session_id,unnest(requested);
    insert into public.review_timer_intervals(session_id,started_at) values(p_session_id,instant);
    -- Even a sub-minute start is actual activity for Work Log suggestions.
    insert into public.review_timer_daily(user_id,studio_id,round_id,work_date)
      select actor,studio,unnest(requested),(instant at time zone 'Europe/Kyiv')::date on conflict do nothing;
    return p_session_id;
  else raise exception 'Choose a valid timer action'; end if;
end;
$$;
revoke all on function public.control_review_timer(text,uuid,uuid[]) from public,anon;
grant execute on function public.control_review_timer(text,uuid,uuid[]) to authenticated;

-- Resolve through the established workflow, accounting before reviewer handoff/rework.
create function private.finish_review_timer_step() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if new.reviewer_id is not distinct from old.reviewer_id and new.completed_at is not distinct from old.completed_at then return new; end if;
  perform private.review_timer_lock(old.reviewer_id);
  for s in select distinct session.id from public.review_timer_sessions session join public.review_timer_members m on m.session_id=session.id
      where session.user_id=old.reviewer_id and m.round_id=old.id and m.finished_at is null loop
    perform private.account_review_timer(s.id,clock_timestamp(),true);
    update public.review_timer_members set finished_at=clock_timestamp() where session_id=s.id and round_id=old.id;
    if not exists(select 1 from public.review_timer_members where session_id=s.id and finished_at is null) then
      update public.review_timer_sessions set state='completed' where id=s.id;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.finish_review_timer_step() from public,anon,authenticated;
create trigger finish_review_timer_step before update of reviewer_id,completed_at on public.task_review_rounds
for each row execute function private.finish_review_timer_step();

create or replace function public.update_task_review(
  p_task_id uuid, p_action text, p_reviewer_id uuid default null,
  p_requires_review boolean default null, p_round_id uuid default null, p_comment text default null,
  p_reviewer_ids uuid[] default null, p_expected_reviewer_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task public.tasks%rowtype;
  project public.projects%rowtype;
  round public.task_review_rounds%rowtype;
  actor uuid := auth.uid();
  is_admin boolean;
  enabled text[];
  next_status text;
  current_ids uuid[];
  requested_ids uuid[];
  requested_id uuid;
  next_reviewer_id uuid;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.user_id = actor and sm.is_active and p.is_active) <> 1 then
    raise exception 'An active studio membership is required';
  end if;
  -- Match timer/save lock order before acquiring task/round locks.
  if p_action in ('approved','rework') then
    perform 1 from public.projects p join public.tasks t on t.project_id=p.id where t.id=p_task_id for share of p;
    perform private.review_timer_lock(rr.reviewer_id) from public.task_review_round_reviewers rr
      where rr.round_id=p_round_id order by rr.reviewer_id;
  end if;
  select * into task from public.tasks where id = p_task_id for update;
  if not found or not coalesce(private.can_access_project(task.project_id), false) then raise exception 'Task not found or unavailable'; end if;
  select * into project from public.projects where id = task.project_id for share;
  if project.archived_at is not null or project.status = 'archived'
    or (project.status = 'completed' and private.is_project_progress_stage(task.stage)) then raise exception 'This project task is read-only'; end if;
  is_admin := coalesce(private.is_studio_admin(project.studio_id), false);
  select enabled_statuses into enabled from public.project_task_stage_columns
    where project_id = task.project_id and stage = task.stage for share;
  if p_action = 'configure' then
    if not is_admin then raise exception 'Only studio administrators can configure task review'; end if;
    if p_reviewer_ids is null and p_requires_review is null then raise exception 'Choose task reviewers'; end if;
    requested_ids := coalesce(p_reviewer_ids, case when p_requires_review then array[p_reviewer_id] else '{}'::uuid[] end);
    if cardinality(requested_ids) <> (select count(distinct reviewer_id) from unnest(requested_ids) as reviewer_id) then
      raise exception 'Task reviewers must be unique and non-null';
    end if;
    select coalesce(array_agg(reviewer_id order by position), '{}'::uuid[]) into current_ids from public.task_reviewers where task_id = task.id;
    if requested_ids = current_ids then return; end if;
    if exists (select 1 from public.task_review_rounds where task_id = task.id and completed_at is null) then
      raise exception 'Resolve the active review before changing reviewers';
    end if;
    foreach requested_id in array requested_ids loop
      if not exists (
        select 1 from public.studio_members sm join public.profiles p on p.id = sm.user_id
        where sm.studio_id = project.studio_id and sm.user_id = requested_id and sm.is_active and p.is_active
          and (sm.system_role = 'admin' or private.is_active_project_task_assignee(task.project_id, requested_id))
      ) then raise exception 'Choose active reviewers with access to this project'; end if;
    end loop;
    delete from public.task_reviewers where task_id = task.id;
    insert into public.task_reviewers(task_id, reviewer_id, position)
    select task.id, reviewer_id, (ordinality - 1)::integer from unnest(requested_ids) with ordinality as reviewers(reviewer_id, ordinality);
    update public.tasks set requires_review = cardinality(requested_ids) > 0, reviewer_id = requested_ids[1] where id = task.id;
  elsif p_action = 'submit' then
    if not coalesce(private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage), false) then
      raise exception 'Only the assignee or studio administrator can submit this task';
    end if;
    if not task.requires_review or task.status <> 'in_progress' then raise exception 'Submit a review from In progress'; end if;
    update public.tasks set status = 'internal_review' where id = task.id;
  elsif p_action in ('approved', 'rework') then
    select * into round from public.task_review_rounds where task_id = task.id and id = p_round_id and completed_at is null for update;
    if not found or task.status <> 'internal_review' then raise exception 'This review is no longer active'; end if;
    if (p_expected_reviewer_id is not null or (select count(*) from public.task_review_round_reviewers where round_id = round.id) > 1)
      and p_expected_reviewer_id is distinct from round.reviewer_id then raise exception 'This review step is no longer active'; end if;
    if not is_admin and round.reviewer_id <> actor then raise exception 'Only the current reviewer or studio administrator can resolve this review'; end if;
    if p_action = 'rework' and coalesce(length(btrim(p_comment)), 0) = 0 then raise exception 'Describe what needs to be fixed'; end if;
    if p_action = 'approved' then
      update public.task_review_round_reviewers set approved_at = clock_timestamp()
      where round_id = round.id and reviewer_id = round.reviewer_id and approved_at is null;
      if not found then raise exception 'This review step is no longer active'; end if;
      select reviewer_id into next_reviewer_id from public.task_review_round_reviewers
      where round_id = round.id and approved_at is null order by position limit 1;
      if next_reviewer_id is not null then
        update public.task_review_rounds set reviewer_id = next_reviewer_id where id = round.id;
        return;
      end if;
    end if;
    next_status := case when p_action = 'rework' then 'in_progress' when 'review' = any(enabled) then 'review' when 'completed' = any(enabled) then 'completed' end;
    if next_status is null then raise exception 'Enable a workflow status after Internal review'; end if;
    update public.task_review_rounds set result = p_action, completed_at = clock_timestamp(),
      rework_comment = case when p_action = 'rework' then btrim(p_comment) else null end where id = round.id;
    update public.tasks set status = next_status where id = task.id;
  else raise exception 'Choose a valid review action';
  end if;
end;
$$;
revoke execute on function public.update_task_review(uuid, text, uuid, boolean, uuid, text, uuid[], uuid) from public, anon;
grant execute on function public.update_task_review(uuid, text, uuid, boolean, uuid, text, uuid[], uuid) to authenticated;


-- Preserve the existing validation and explicit submission path behind a delta merge.
alter function public.save_daily_work_log(date,jsonb) set schema private;
revoke all on function private.save_daily_work_log(date,jsonb) from public,anon,authenticated;
create function public.save_daily_work_log(p_work_date date,p_entries jsonb,p_timer_snapshot jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  merged jsonb;
begin
  if actor is null then raise exception 'An active studio membership is required'; end if;
  perform 1 from public.studio_members where user_id=actor and is_active for update;
  perform private.review_timer_lock(actor);
  perform public.control_review_timer('sync');
  if p_timer_snapshot is null then
    if exists(select 1 from public.review_timer_daily where user_id=actor and work_date=p_work_date and minutes>0) then
      raise exception 'Refresh the Work Log before editing timer-tracked time';
    end if;
    perform private.save_daily_work_log(p_work_date,p_entries);
    return;
  end if;
  if jsonb_typeof(p_timer_snapshot)<>'object' or p_entries is null or jsonb_typeof(p_entries)<>'array' then
    raise exception 'Enter valid Work Log entries and timer snapshot'; end if;
  if exists(select 1 from jsonb_each(p_timer_snapshot) snap where
    jsonb_typeof(snap.value)<>'number' or (snap.value::text)::numeric<0 or (snap.value::text)::numeric<>trunc((snap.value::text)::numeric)
    or (snap.value::text)::numeric>coalesce((select d.minutes from public.review_timer_daily d where d.user_id=actor and d.work_date=p_work_date and d.round_id=snap.key::uuid),0)) then
    raise exception 'Invalid timer snapshot'; end if;
  -- Validate the submitted payload before merging; no duplicate/invalid rows disappear.
  if exists(select 1 from jsonb_array_elements(p_entries) item where jsonb_typeof(item)<>'object'
      or jsonb_typeof(item->'minutes') is distinct from 'number' or (item->>'minutes')::numeric<=0
      or (item->>'minutes')::numeric<>trunc((item->>'minutes')::numeric))
    or exists(select 1 from jsonb_to_recordset(p_entries) as row(task_id uuid,review_round_id uuid)
      group by task_id,review_round_id having count(*)>1) then raise exception 'Enter unique activities and positive whole minutes'; end if;
  with supplied as (
    select * from jsonb_to_recordset(p_entries) as row(activity_kind text,task_id uuid,review_round_id uuid,minutes integer)
  ), adjusted as (
    select e.activity_kind,e.task_id,e.review_round_id,e.minutes + coalesce(d.minutes,0) - coalesce((p_timer_snapshot->>e.review_round_id::text)::integer,0) as minutes
    from supplied e left join public.review_timer_daily d on d.user_id=actor and d.work_date=p_work_date and d.round_id=e.review_round_id
    union all
    select 'review',r.task_id,d.round_id,d.minutes-coalesce((p_timer_snapshot->>d.round_id::text)::integer,0)
    from public.review_timer_daily d join public.task_review_rounds r on r.id=d.round_id
    where d.user_id=actor and d.work_date=p_work_date and not exists(select 1 from supplied e where e.review_round_id=d.round_id)
      and d.minutes>coalesce((p_timer_snapshot->>d.round_id::text)::integer,0)
  ) select coalesce(jsonb_agg(to_jsonb(adjusted)),'[]'::jsonb) into merged from adjusted;
  perform private.save_daily_work_log(p_work_date,merged);
end;
$$;
revoke all on function public.save_daily_work_log(date,jsonb,jsonb) from public,anon;
grant execute on function public.save_daily_work_log(date,jsonb,jsonb) to authenticated;
-- Cheap minute-change signal avoids scheduling Finance maintenance on every timer poll.
create function public.sync_review_timer() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); before_minutes bigint; after_minutes bigint; session uuid; affected_studio uuid;
begin
  if actor is null then raise exception 'An active studio membership is required'; end if;
  perform private.review_timer_lock(actor);
  select coalesce(sum(minutes),0) into before_minutes from public.review_timer_daily where user_id=actor;
  select studio_id into affected_studio from public.review_timer_sessions where user_id=actor and state='active';
  session:=public.control_review_timer('sync');
  select coalesce(sum(minutes),0) into after_minutes from public.review_timer_daily where user_id=actor;
  return jsonb_build_object('sessionId',session,'changed',before_minutes<>after_minutes,'studioId',affected_studio);
end;
$$;
revoke all on function public.sync_review_timer() from public,anon;
grant execute on function public.sync_review_timer() to authenticated;

-- Entry totals and automatic baselines must be captured under the same user lock.
create function public.get_work_log_timer_snapshot(p_work_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); studio uuid; synced jsonb; entries jsonb; snapshot jsonb;
begin
  synced:=public.sync_review_timer();
  select studio_id into studio from public.studio_members where user_id=actor and is_active;
  select coalesce(jsonb_agg(jsonb_build_object('activity_kind',activity_kind,'task_id',task_id,'review_round_id',review_round_id,'minutes',minutes)),'[]'::jsonb)
    into entries from public.work_log_entries where user_id=actor and studio_id=studio and work_date=p_work_date;
  select coalesce(jsonb_object_agg(round_id::text,minutes),'{}'::jsonb) into snapshot
    from public.review_timer_daily where user_id=actor and studio_id=studio and work_date=p_work_date;
  return jsonb_build_object('entries',entries,'timerSnapshot',snapshot,'changed',synced->'changed','studioId',synced->'studioId');
end;
$$;
revoke all on function public.get_work_log_timer_snapshot(date) from public,anon;
grant execute on function public.get_work_log_timer_snapshot(date) to authenticated;

-- Eligibility changes stop the clock in their own transaction, even while clients are closed.
create function private.pause_revoked_review_timers() returns trigger
language plpgsql security definer set search_path = '' as $$
declare candidate record; target_user uuid; target_project uuid;
begin
  if tg_table_name='profiles' then target_user:=new.id;
  elsif tg_table_name='studio_members' then target_user:=old.user_id;
  elsif tg_table_name='project_members' then target_user:=old.user_id; target_project:=old.project_id;
  elsif tg_table_name='projects' then target_project:=new.id;
  end if;
  -- Wait for an in-flight Start before discovering sessions, including its uncommitted insert.
  if target_user is not null then perform private.review_timer_lock(target_user); end if;
  for candidate in select distinct s.id,s.user_id from public.review_timer_sessions s
    join public.review_timer_members m on m.session_id=s.id join public.task_review_rounds r on r.id=m.round_id
    where s.state='active' and (target_user is null or s.user_id=target_user)
      and (target_project is null or r.project_id=target_project) order by s.user_id loop
    perform private.review_timer_lock(candidate.user_id);
    if exists(select 1 from public.review_timer_members m join public.task_review_rounds r on r.id=m.round_id
      join public.tasks t on t.id=r.task_id join public.projects p on p.id=t.project_id
      where m.session_id=candidate.id and (
        r.completed_at is not null or r.reviewer_id<>candidate.user_id or t.status<>'internal_review'
        or p.archived_at is not null or p.status='archived' or (p.status='completed' and private.is_project_progress_stage(t.stage))
        or not exists(select 1 from public.studio_members sm join public.profiles profile on profile.id=sm.user_id
          where sm.user_id=candidate.user_id and sm.studio_id=p.studio_id and sm.is_active and profile.is_active
            and (sm.system_role='admin' or exists(select 1 from public.project_members pm
              where pm.project_id=p.id and pm.user_id=candidate.user_id and pm.is_active)))
      )) then perform private.account_review_timer(candidate.id,clock_timestamp(),true); end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.pause_revoked_review_timers() from public,anon,authenticated;
create trigger pause_review_timer_profile after update of is_active on public.profiles
for each row when (old.is_active is distinct from new.is_active) execute function private.pause_revoked_review_timers();
create trigger pause_review_timer_membership after update of is_active,system_role on public.studio_members
for each row when (old.is_active is distinct from new.is_active or old.system_role is distinct from new.system_role) execute function private.pause_revoked_review_timers();
create trigger pause_review_timer_membership_delete after delete on public.studio_members
for each row execute function private.pause_revoked_review_timers();
create trigger pause_review_timer_project_member after update of is_active on public.project_members
for each row when (old.is_active is distinct from new.is_active) execute function private.pause_revoked_review_timers();
create trigger pause_review_timer_project_member_delete after delete on public.project_members
for each row execute function private.pause_revoked_review_timers();
create trigger pause_review_timer_project after update of status,archived_at on public.projects
for each row when (old.status is distinct from new.status or old.archived_at is distinct from new.archived_at) execute function private.pause_revoked_review_timers();

notify pgrst,'reload schema';
