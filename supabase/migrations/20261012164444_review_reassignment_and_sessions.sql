-- Persist a logical work session across the existing immutable timer intervals.
alter table public.review_timer_sessions add column work_session_id uuid;
-- Historical resumes can be reconstructed from consecutive intervals and their
-- unfinished membership at the next Start, without changing time or decisions.
with recursive ordered as (
  select s.*,row_number() over(partition by user_id order by started_at,id) as sequence
  from public.review_timer_sessions s
), linked as (
  select s.id,s.user_id,s.studio_id,s.sequence,s.started_at,s.paused_at,s.id as work_session_id
  from ordered s where sequence=1
  union all
  select s.id,s.user_id,s.studio_id,s.sequence,s.started_at,s.paused_at,
    case when previous.studio_id=s.studio_id and previous.paused_at<=s.started_at
      and array(select m.round_id from public.review_timer_members m where m.session_id=previous.id
        and (m.finished_at is null or m.finished_at>s.started_at) order by m.round_id)
      = array(select m.round_id from public.review_timer_members m where m.session_id=s.id order by m.round_id)
    then previous.work_session_id else s.id end
  from ordered s join linked previous on previous.user_id=s.user_id and s.sequence=previous.sequence+1
)
update public.review_timer_sessions s set work_session_id=linked.work_session_id from linked where linked.id=s.id;
alter table public.review_timer_sessions alter column work_session_id set not null;
alter table public.review_timer_sessions alter column work_session_id set default gen_random_uuid();
create index review_timer_work_session on public.review_timer_sessions(user_id,work_session_id);
comment on column public.review_timer_sessions.work_session_id is 'Logical reviewer work session; resume retains this identity while each timer interval retains its own id.';

create or replace function public.control_review_timer(p_action text, p_session_id uuid default null, p_round_ids uuid[] default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  studio uuid;
  active_id uuid;
  requested uuid[];
  group_project uuid;
  group_stage text;
  instant timestamptz;
  work_session uuid;
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
    -- Resume the exact unfinished membership, even after another member resolved.
    select s.work_session_id into work_session from public.review_timer_sessions s
      where s.user_id=actor and s.studio_id=studio and s.state='paused'
        and requested = array(select m.round_id from public.review_timer_members m
          where m.session_id=s.id and m.finished_at is null order by m.round_id)
      order by s.started_at desc,s.id limit 1;
    -- Resuming creates a fresh interval ID. A retried old Start cannot restart time.
    update public.review_timer_sessions s set state='completed' where s.user_id=actor and s.state='paused'
      and exists(select 1 from public.review_timer_members m where m.session_id=s.id and m.round_id=any(requested));
    insert into public.review_timer_sessions(id,studio_id,user_id,state,started_at,running_since,accounted_at,work_session_id)
      values(p_session_id,studio,actor,'active',instant,instant,instant,coalesce(work_session,p_session_id));
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


create or replace function private.guard_task_review_workflow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  latest public.task_review_rounds%rowtype;
  enabled text[];
  new_round_id uuid;
begin
  if exists (select 1 from public.task_review_rounds where task_id = old.id and completed_at is null)
    and (new.requires_review is distinct from old.requires_review or (new.reviewer_id is distinct from old.reviewer_id and not (
        coalesce(private.is_studio_admin((select studio_id from public.projects where id=old.project_id)),false)
        and new.reviewer_id is not distinct from (select reviewer_id from public.task_reviewers where task_id=old.id and position=0)
      ))
      or new.stage is distinct from old.stage or new.project_id is distinct from old.project_id) then
    raise exception 'Resolve the active review before changing review settings or task stage';
  end if;
  if not new.requires_review then return new; end if;
  select enabled_statuses into enabled from public.project_task_stage_columns where project_id = new.project_id and stage = new.stage;
  if not (array['in_progress', 'internal_review']::text[] <@ enabled)
    or not (enabled && array['review', 'completed']::text[]) then
    raise exception 'Review requires In progress, Internal review, and a later workflow status';
  end if;
  if not old.requires_review and old.status not in ('todo', 'in_progress') then
    raise exception 'Enable review while the task is To do or In progress';
  end if;
  if new.status is not distinct from old.status then return new; end if;
  select * into latest from public.task_review_rounds where task_id = old.id order by round_number desc limit 1;
  if old.status = 'internal_review' and (latest.id is null or latest.completed_at is null) then
    raise exception 'Approve or send back the active review from task details';
  end if;
  if new.status = 'internal_review' then
    if old.status <> 'in_progress' then raise exception 'Submit a review from In progress'; end if;
    if not exists (select 1 from public.task_reviewers where task_id = new.id and position = 0 and reviewer_id = new.reviewer_id)
      or exists (
        select 1 from public.task_reviewers assignment where assignment.task_id = new.id and not exists (
          select 1 from public.studio_members sm join public.profiles p on p.id = sm.user_id
          join public.projects project on project.studio_id = sm.studio_id
          where project.id = new.project_id and sm.user_id = assignment.reviewer_id and sm.is_active and p.is_active
            and (sm.system_role = 'admin' or private.is_active_project_task_assignee(new.project_id, assignment.reviewer_id))
        )
      ) then raise exception 'Choose active reviewers with access to this project'; end if;
    insert into public.task_review_rounds(task_id, project_id, round_number, reviewer_id)
    values (new.id, new.project_id, coalesce(latest.round_number, 0) + 1, new.reviewer_id) returning id into new_round_id;
    insert into public.task_review_round_reviewers(round_id, reviewer_id, position)
    select new_round_id, reviewer_id, position from public.task_reviewers where task_id = new.id;
  elsif new.status in ('review', 'completed') and
    (old.status in ('todo', 'in_progress') or latest.result is distinct from 'approved') then
    raise exception 'Submit and approve this task review before moving to a later status';
  end if;
  return new;
end;
$$;


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
  approved_ids uuid[];
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.user_id = actor and sm.is_active and p.is_active) <> 1 then
    raise exception 'An active studio membership is required';
  end if;
  -- Match timer/save lock order before acquiring task/round locks.
  if p_action in ('approved','rework','reassign') then
    perform 1 from public.projects p join public.tasks t on t.project_id=p.id where t.id=p_task_id for share of p;
    perform private.review_timer_lock(locked.reviewer_id) from (
      select rr.reviewer_id from public.task_review_round_reviewers rr where rr.round_id=p_round_id
      union select unnest(p_reviewer_ids) where p_action='reassign'
    ) locked order by locked.reviewer_id;
  end if;
  select * into task from public.tasks where id = p_task_id for update;
  if not found or not coalesce(private.can_access_project(task.project_id), false) then raise exception 'Task not found or unavailable'; end if;
  select * into project from public.projects where id = task.project_id for share;
  if project.archived_at is not null or project.status = 'archived'
    or (project.status = 'completed' and private.is_project_progress_stage(task.stage)) then raise exception 'This project task is read-only'; end if;
  is_admin := coalesce(private.is_studio_admin(project.studio_id), false);
  select enabled_statuses into enabled from public.project_task_stage_columns
    where project_id = task.project_id and stage = task.stage for share;
  if p_action in ('configure','reassign') then
    if not is_admin then raise exception 'Only studio administrators can configure task review'; end if;
    if p_reviewer_ids is null and p_requires_review is null then raise exception 'Choose task reviewers'; end if;
    requested_ids := coalesce(p_reviewer_ids, case when p_requires_review then array[p_reviewer_id] else '{}'::uuid[] end);
    if cardinality(requested_ids) <> (select count(distinct reviewer_id) from unnest(requested_ids) as reviewer_id) then
      raise exception 'Task reviewers must be unique and non-null';
    end if;
    select coalesce(array_agg(reviewer_id order by position), '{}'::uuid[]) into current_ids from public.task_reviewers where task_id = task.id;
    if p_action='reassign' then
      select * into round from public.task_review_rounds
        where task_id=task.id and id=p_round_id and completed_at is null for update;
      if not found or task.status<>'internal_review' then raise exception 'This review is no longer active'; end if;
      if p_expected_reviewer_id is distinct from round.reviewer_id then raise exception 'This review step is no longer active'; end if;
      select coalesce(array_agg(reviewer_id order by position),'{}'::uuid[]) into approved_ids
        from public.task_review_round_reviewers where round_id=round.id and approved_at is not null;
      if cardinality(requested_ids)<=cardinality(approved_ids)
        or requested_ids[1:cardinality(approved_ids)] is distinct from approved_ids then
        raise exception 'Preserve approved reviewers and at least one pending reviewer';
      end if;
    elsif exists (select 1 from public.task_review_rounds where task_id = task.id and completed_at is null) then
      if requested_ids=current_ids then return; end if;
      raise exception 'Change the active reviewer sequence from the review section';
    end if;
    if requested_ids=current_ids then return; end if;
    foreach requested_id in array requested_ids loop
      if p_action='reassign' and requested_id=any(approved_ids) then continue; end if;
      if not exists (
        select 1 from public.studio_members sm join public.profiles p on p.id = sm.user_id
        where sm.studio_id = project.studio_id and sm.user_id = requested_id and sm.is_active and p.is_active
          and (sm.system_role = 'admin' or private.is_active_project_task_assignee(task.project_id, requested_id))
      ) then raise exception 'Choose active reviewers with access to this project'; end if;
    end loop;
    if p_action='reassign' then
      -- Reviewer change fires the existing timer checkpoint before removing pending assignments.
      next_reviewer_id := requested_ids[cardinality(approved_ids)+1];
      update public.task_review_rounds set reviewer_id=next_reviewer_id where id=round.id;
      delete from public.task_review_round_reviewers where round_id=round.id and approved_at is null;
      insert into public.task_review_round_reviewers(round_id,reviewer_id,position)
        select round.id,reviewer_id,(ordinality-1)::integer
        from unnest(requested_ids) with ordinality reviewers(reviewer_id,ordinality)
        where ordinality>cardinality(approved_ids);
      perform private.record_project_activity(project.studio_id,task.project_id,'task_updated','task',task.id,
        jsonb_build_object('review_round_id',round.id,'review_action','reassigned',
          'reviewer_ids',jsonb_build_object('from',current_ids,'to',requested_ids)));
    end if;
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


