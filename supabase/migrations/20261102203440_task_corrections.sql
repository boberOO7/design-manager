-- Corrections are work cycles on a completed task, never new productivity completions.
create table public.task_corrections (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 5000),
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  due_date date,
  status text not null default 'in_progress' check (status in ('in_progress','internal_review','closed')),
  reviewer_ids uuid[] not null check (cardinality(reviewer_ids)>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  unique(id,task_id),
  check ((status='closed')=(closed_at is not null)),
  check (closed_at is null or closed_at>=created_at),
  check (updated_at>=created_at)
);
create unique index task_corrections_one_active on public.task_corrections(task_id) where status<>'closed';
create index task_corrections_assignee on public.task_corrections(assignee_id) where status<>'closed';
create table public.task_correction_events (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references public.task_corrections(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  changes jsonb not null
);
create index task_correction_events_cycle on public.task_correction_events(correction_id,created_at);
alter table public.task_corrections enable row level security;
alter table public.task_correction_events enable row level security;
revoke all on public.task_corrections,public.task_correction_events from public,anon,authenticated;
grant select on public.task_corrections,public.task_correction_events to authenticated;
grant all on public.task_corrections,public.task_correction_events to service_role;
create policy task_corrections_read on public.task_corrections for select to authenticated
  using (exists(select 1 from public.tasks t where t.id=task_id));
create policy task_correction_events_read on public.task_correction_events for select to authenticated
  using (exists(select 1 from public.task_corrections c where c.id=correction_id));
alter table public.task_review_rounds add column correction_id uuid;
alter table public.task_review_rounds add constraint task_review_rounds_correction_task_fkey
  foreign key(correction_id,task_id) references public.task_corrections(id,task_id) on delete cascade;
create index task_review_rounds_correction on public.task_review_rounds(correction_id) where correction_id is not null;
alter table public.work_log_entries add column correction_id uuid;
alter table public.work_log_entries add constraint work_log_entries_correction_task_fkey
  foreign key(correction_id,task_id) references public.task_corrections(id,task_id) on delete cascade;
alter table public.work_log_entries add constraint work_log_entries_correction_kind check (correction_id is null or activity_kind in ('task','review'));
create index work_log_entries_correction on public.work_log_entries(correction_id) where correction_id is not null;
drop index public.work_log_entries_task_day_key;
create unique index work_log_entries_task_day_key on public.work_log_entries(user_id,work_date,task_id,correction_id) nulls not distinct where activity_kind='task';

create function private.audit_task_correction() returns trigger
language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype; changes jsonb;
begin
  select p.* into project from public.projects p join public.tasks t on t.project_id=p.id where t.id=new.task_id;
  changes:=jsonb_build_object('from',case when tg_op='UPDATE' then to_jsonb(old) else null end,'to',to_jsonb(new));
  insert into public.task_correction_events(correction_id,actor_id,changes) values(new.id,auth.uid(),changes);
  perform private.record_project_activity(project.studio_id,project.id,'task_updated','task',new.task_id,
    jsonb_build_object('correction_id',new.id,'correction',changes));
  perform private.create_notification('task_assigned',project.studio_id,new.assignee_id,auth.uid(),
    'Task correction',new.description,'/projects/'||project.id||'?task='||new.task_id,'task',new.task_id,
    jsonb_build_object('correctionId',new.id,'subject',new.description,'projectName',project.name));
  return new;
end; $$;
revoke all on function private.audit_task_correction() from public,anon,authenticated;
create trigger audit_task_correction after insert or update on public.task_corrections
  for each row execute function private.audit_task_correction();

create function public.update_task_correction(p_task_id uuid,p_action text,p_correction_id uuid default null,
  p_description text default null,p_assignee_id uuid default null,p_due_date date default null,p_reviewer_ids uuid[] default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare task public.tasks%rowtype; project public.projects%rowtype; correction public.task_corrections%rowtype;
  actor uuid:=auth.uid(); is_admin boolean; chosen uuid[]; person uuid; round_id uuid;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id=sm.user_id
    where sm.user_id=actor and sm.is_active and p.is_active)<>1 then raise exception 'An active studio membership is required'; end if;
  -- The same project -> task lock order as the review workflow.
  perform 1 from public.projects p join public.tasks t on t.project_id=p.id where t.id=p_task_id for share of p;
  select * into task from public.tasks where id=p_task_id for update;
  if not found or not coalesce(private.can_access_project(task.project_id),false) then raise exception 'Task unavailable'; end if;
  select * into project from public.projects where id=task.project_id;
  if project.archived_at is not null or project.status='archived' then raise exception 'Archived tasks are read-only'; end if;
  is_admin:=coalesce(private.is_studio_admin(project.studio_id),false);
  if task.status<>'completed' then raise exception 'Corrections require a completed task'; end if;
  if p_action='cancel_completion' then
    if not is_admin then raise exception 'Only studio administrators can cancel completion'; end if;
    if exists(select 1 from public.task_corrections where task_id=task.id and status<>'closed') then raise exception 'Close the active correction before cancelling completion'; end if;
    perform set_config('studioflow.cancel_completion',task.id::text,true);
    update public.tasks set status='in_progress' where id=task.id;
    perform set_config('studioflow.cancel_completion','',true);
    return task.id;
  end if;
  if p_action='submit' and (p_description is not null or p_assignee_id is not null or p_due_date is not null or p_reviewer_ids is not null) then
    raise exception 'Update correction details before submitting'; end if;
  if p_action='create' then
    if not is_admin and task.assignee_id is distinct from actor then raise exception 'Only the assignee or administrator can create a correction'; end if;
    chosen:=coalesce(p_reviewer_ids,array(select reviewer_id from public.task_reviewers where task_id=task.id order by position));
    person:=coalesce(p_assignee_id,task.assignee_id,actor);
  else
    select * into correction from public.task_corrections where id=p_correction_id and task_id=task.id for update;
    if not found or correction.status<>'in_progress' then raise exception 'This correction is no longer in progress'; end if;
    if not is_admin and correction.assignee_id<>actor then raise exception 'Only the correction assignee or administrator can update it'; end if;
    chosen:=coalesce(p_reviewer_ids,correction.reviewer_ids);
    person:=coalesce(p_assignee_id,correction.assignee_id);
  end if;
  if not is_admin and chosen is distinct from (case when p_action='create' then array(select reviewer_id from public.task_reviewers where task_id=task.id order by position) else correction.reviewer_ids end) then
    raise exception 'Only administrators can change the reviewer sequence'; end if;
  if not is_admin and person is distinct from actor then raise exception 'Only administrators can change the assignee'; end if;
  if coalesce(cardinality(chosen),0)=0 or cardinality(chosen)<>(select count(distinct id) from unnest(chosen) id) then raise exception 'Choose unique active reviewers'; end if;
  foreach person in array array_append(chosen,person) loop
    if not exists(select 1 from public.studio_members sm join public.profiles p on p.id=sm.user_id
      where sm.studio_id=project.studio_id and sm.user_id=person and sm.is_active and p.is_active
      and (sm.system_role='admin' or private.is_active_project_task_assignee(task.project_id,person))) then raise exception 'Choose active project members'; end if;
  end loop;
  if p_action='create' then
    insert into public.task_corrections(task_id,description,assignee_id,created_by,due_date,reviewer_ids)
      values(task.id,btrim(p_description),coalesce(p_assignee_id,task.assignee_id,actor),actor,p_due_date,chosen) returning id into p_correction_id;
  elsif p_action='update' then
    update public.task_corrections set description=btrim(p_description),assignee_id=coalesce(p_assignee_id,assignee_id),due_date=p_due_date,
      reviewer_ids=chosen,updated_at=clock_timestamp() where id=correction.id;
  elsif p_action='submit' then
    insert into public.task_review_rounds(task_id,project_id,round_number,reviewer_id,correction_id)
      select task.id,task.project_id,coalesce(max(round_number),0)+1,chosen[1],correction.id from public.task_review_rounds where task_id=task.id returning id into round_id;
    insert into public.task_review_round_reviewers(round_id,reviewer_id,position)
      select round_id,id,(ordinality-1)::integer from unnest(chosen) with ordinality reviewers(id,ordinality);
    update public.task_corrections set status='internal_review',updated_at=clock_timestamp() where id=correction.id;
  else raise exception 'Choose a valid correction action'; end if;
  return p_correction_id;
end; $$;
revoke all on function public.update_task_correction(uuid,text,uuid,text,uuid,date,uuid[]) from public,anon;
grant execute on function public.update_task_correction(uuid,text,uuid,text,uuid,date,uuid[]) to authenticated;

create function private.guard_completed_task_corrections() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.status='completed' and new.status is distinct from old.status and auth.uid() is not null then
    if not coalesce(private.is_studio_admin((select studio_id from public.projects where id=old.project_id)),false)
      or current_setting('studioflow.cancel_completion',true) is distinct from old.id::text then
      raise exception 'Use Create correction, or the administrative Cancel completion action';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.guard_completed_task_corrections() from public,anon,authenticated;
create trigger guard_completed_task_corrections before update of status on public.tasks
  for each row execute function private.guard_completed_task_corrections();

create or replace function public.get_personal_task_ids() returns table(task_id uuid)
language sql stable security invoker set search_path='' as $$
  select id from public.tasks where assignee_id=(select auth.uid())
  union select c.task_id from public.task_collaborators c where user_id=(select auth.uid())
  union select c.task_id from public.task_corrections c where assignee_id=(select auth.uid()) and status<>'closed';
$$;

CREATE OR REPLACE FUNCTION private.guard_task_review_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not old.requires_review and old.status not in ('todo', 'in_progress', 'internal_review') then
    raise exception 'Enable review while the task is To do, In progress, or Internal review';
  end if;
  -- Older Internal Review tasks may predate reviewer assignment/rounds.
  if new.status is not distinct from old.status and (new.status<>'internal_review'
    or exists(select 1 from public.task_review_rounds where task_id=old.id and completed_at is null)) then return new; end if;
  select * into latest from public.task_review_rounds where task_id = old.id and correction_id is null order by round_number desc limit 1;
  if old.status = 'internal_review' and new.status is distinct from old.status and (latest.id is null or latest.completed_at is null) then
    raise exception 'Approve or send back the active review from task details';
  end if;
  if new.status = 'internal_review' then
    if old.status not in ('in_progress','internal_review') then raise exception 'Submit a review from In progress'; end if;
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
    values (new.id, new.project_id, (select coalesce(max(round_number),0)+1 from public.task_review_rounds where task_id=new.id), new.reviewer_id) returning id into new_round_id;
    insert into public.task_review_round_reviewers(round_id, reviewer_id, position)
    select new_round_id, reviewer_id, position from public.task_reviewers where task_id = new.id;
  elsif new.status in ('review', 'completed') and
    (old.status in ('todo', 'in_progress') or latest.result is distinct from 'approved') then
    raise exception 'Submit and approve this task review before moving to a later status';
  end if;
  return new;
end;$function$;


CREATE OR REPLACE FUNCTION public.update_task_review(p_task_id uuid, p_action text, p_reviewer_id uuid DEFAULT NULL::uuid, p_requires_review boolean DEFAULT NULL::boolean, p_round_id uuid DEFAULT NULL::uuid, p_comment text DEFAULT NULL::text, p_reviewer_ids uuid[] DEFAULT NULL::uuid[], p_expected_reviewer_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  correction public.task_corrections%rowtype;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.user_id = actor and sm.is_active and p.is_active) <> 1 then
    raise exception 'An active studio membership is required';
  end if;
  -- Main task edits carry the same expected round/reviewer as direct reassignment.
  if p_action='configure' and p_round_id is not null then p_action:='reassign'; end if;
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
  select c.* into correction from public.task_corrections c join public.task_review_rounds r on r.correction_id=c.id where r.id=p_round_id and r.task_id=task.id;
  if project.archived_at is not null or project.status = 'archived'
    or (correction.id is null and project.status = 'completed' and private.is_project_progress_stage(task.project_id, task.stage)) then raise exception 'This project task is read-only'; end if;
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
    if correction.id is not null then current_ids:=correction.reviewer_ids;
    else select coalesce(array_agg(reviewer_id order by position), '{}'::uuid[]) into current_ids from public.task_reviewers where task_id = task.id; end if;
    if p_action='reassign' then
      select * into round from public.task_review_rounds
        where task_id=task.id and id=p_round_id and completed_at is null for update;
      if not found or (correction.id is null and task.status<>'internal_review') or (correction.id is not null and correction.status<>'internal_review') then raise exception 'This review is no longer active'; end if;
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
    if correction.id is not null then
      update public.task_corrections set reviewer_ids=requested_ids,updated_at=clock_timestamp() where id=correction.id;
    else
    delete from public.task_reviewers where task_id = task.id;
    insert into public.task_reviewers(task_id, reviewer_id, position)
    select task.id, reviewer_id, (ordinality - 1)::integer from unnest(requested_ids) with ordinality as reviewers(reviewer_id, ordinality);
    update public.tasks set requires_review = cardinality(requested_ids) > 0, reviewer_id = requested_ids[1] where id = task.id;
    end if;
  elsif p_action = 'submit' then
    if not coalesce(private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage), false) then
      raise exception 'Only the assignee or studio administrator can submit this task';
    end if;
    if not task.requires_review or task.status <> 'in_progress' then raise exception 'Submit a review from In progress'; end if;
    update public.tasks set status = 'internal_review' where id = task.id;
  elsif p_action in ('approved', 'rework') then
    select * into round from public.task_review_rounds where task_id = task.id and id = p_round_id and completed_at is null for update;
    if not found or (correction.id is null and task.status <> 'internal_review') or (correction.id is not null and correction.status<>'internal_review') then raise exception 'This review is no longer active'; end if;
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
    next_status := case when correction.id is not null then 'completed' when p_action = 'rework' then 'in_progress' when 'review' = any(enabled) then 'review' when 'completed' = any(enabled) then 'completed' end;
    if next_status is null then raise exception 'Enable a workflow status after Internal review'; end if;
    update public.task_review_rounds set result = p_action, completed_at = clock_timestamp(),
      rework_comment = case when p_action = 'rework' then btrim(p_comment) else null end where id = round.id;
    if correction.id is not null then
      update public.task_corrections set status=case when p_action='approved' then 'closed' else 'in_progress' end,
        closed_at=case when p_action='approved' then clock_timestamp() else null end,updated_at=clock_timestamp() where id=correction.id;
    else
      update public.tasks set status = next_status where id = task.id;
    end if;
  else raise exception 'Choose a valid review action';
  end if;
end;$function$;


CREATE OR REPLACE FUNCTION public.control_review_timer(p_action text, p_session_id uuid DEFAULT NULL::uuid, p_round_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          where m.session_id=active_id and (r.completed_at is not null or r.reviewer_id<>actor or not ((r.correction_id is null and t.status='internal_review') or exists(select 1 from public.task_corrections c where c.id=r.correction_id and c.status='internal_review' and t.status='completed'))
            or not coalesce(private.can_access_project(p.id),false) or p.archived_at is not null or p.status='archived'
            or (r.correction_id is null and p.status='completed' and private.is_project_progress_stage(t.project_id, t.stage)))));
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
        and ((r.correction_id is null and t.status='internal_review') or exists(select 1 from public.task_corrections c where c.id=r.correction_id and c.status='internal_review' and t.status='completed')) and p.studio_id=studio and private.can_access_project(p.id)
        and p.archived_at is null and p.status<>'archived' and (r.correction_id is not null or p.status<>'completed' or not private.is_project_progress_stage(t.project_id, t.stage))
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
end;$function$;


CREATE OR REPLACE FUNCTION private.pause_revoked_review_timers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        r.completed_at is not null or r.reviewer_id<>candidate.user_id or not ((r.correction_id is null and t.status='internal_review') or exists(select 1 from public.task_corrections c where c.id=r.correction_id and c.status='internal_review' and t.status='completed'))
        or p.archived_at is not null or p.status='archived' or (r.correction_id is null and p.status='completed' and private.is_project_progress_stage(t.project_id, t.stage))
        or not exists(select 1 from public.studio_members sm join public.profiles profile on profile.id=sm.user_id
          where sm.user_id=candidate.user_id and sm.studio_id=p.studio_id and sm.is_active and profile.is_active
            and (sm.system_role='admin' or exists(select 1 from public.project_members pm
              where pm.project_id=p.id and pm.user_id=candidate.user_id and pm.is_active)))
      )) then perform private.account_review_timer(candidate.id,clock_timestamp(),true); end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;$function$;

-- Assignment history determines who can record historical correction work.
create function private.can_log_correction_work(p_correction uuid,p_actor uuid,p_date date) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.task_corrections c where c.id=p_correction
    and p_date>=(c.created_at at time zone 'Europe/Kyiv')::date
    and (c.closed_at is null or p_date<=(c.closed_at at time zone 'Europe/Kyiv')::date)
    and exists(select 1 from (
      select changes->'to'->>'assignee_id' as assignee,created_at,
        lead(created_at) over(order by created_at,id) as next_change
      from public.task_correction_events where correction_id=p_correction
    ) assignment where assignment.assignee=p_actor::text
      and assignment.created_at<((p_date+1)::timestamp at time zone 'Europe/Kyiv')
      and (assignment.next_change is null or assignment.next_change>=(p_date::timestamp at time zone 'Europe/Kyiv'))));
$$;
revoke all on function private.can_log_correction_work(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.save_daily_work_log(p_work_date date, p_entries jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_studio uuid;
  entry record;
  actor_admin boolean;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.user_id = actor and sm.is_active and p.is_active) <> 1 then
    raise exception 'An active studio membership is required';
  end if;
  select studio_id into actor_studio from public.studio_members where user_id = actor and is_active for update;
  actor_admin := coalesce(private.is_studio_admin(actor_studio), false);
  if p_work_date is null or p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Enter a work date and work-log entries';
  end if;
  if p_work_date > (now() at time zone 'Europe/Kyiv')::date then
    raise exception 'Work time cannot be logged for a future date';
  end if;
  if exists (select 1 from jsonb_array_elements(p_entries) item
    where jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'minutes') is distinct from 'number'
      or (item->>'minutes')::numeric <= 0 or (item->>'minutes')::numeric <> trunc((item->>'minutes')::numeric)) then
    raise exception 'Enter positive whole minutes';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_entries) as row(review_round_id uuid)
    where review_round_id is not null group by review_round_id having count(*)>1) then
    raise exception 'Work-log reviews must be unique'; end if;
  for entry in select * from jsonb_to_recordset(p_entries)
    as row(activity_kind text, task_id uuid, review_round_id uuid, correction_id uuid, internal_activity_type text, minutes integer) loop
    if entry.activity_kind = 'internal' then
      if not actor_admin then raise exception 'Only studio administrators can log internal work'; end if;
      if entry.internal_activity_type is distinct from 'team_walkthrough' or entry.task_id is not null
        or entry.review_round_id is not null or entry.correction_id is not null then raise exception 'Choose a valid internal activity'; end if;
      continue;
    end if;
    if entry.activity_kind is null or entry.activity_kind not in ('task', 'review') or entry.task_id is null
      or entry.internal_activity_type is not null
      or (entry.activity_kind = 'review') <> (entry.review_round_id is not null) then
      raise exception 'Choose task work or a specific review round';
    end if;
    if entry.correction_id is not null and not exists(select 1 from public.task_corrections c
      where c.id=entry.correction_id and c.task_id=entry.task_id
        and (entry.activity_kind='review' or private.can_log_correction_work(c.id,actor,p_work_date))
        and p_work_date>=(c.created_at at time zone 'Europe/Kyiv')::date
        and (c.closed_at is null or p_work_date<=(c.closed_at at time zone 'Europe/Kyiv')::date)) then
      raise exception 'Correction time is unavailable for this person or date'; end if;
    if entry.activity_kind='review' and entry.correction_id is not null and not exists(
      select 1 from public.task_review_rounds r where r.id=entry.review_round_id and r.correction_id=entry.correction_id
    ) then raise exception 'Review time must belong to its correction'; end if;
    if entry.activity_kind='task' and entry.correction_id is null and exists(
      select 1 from public.task_corrections c join public.tasks t on t.id=c.task_id
      where c.task_id=entry.task_id and t.completed_at<p_work_date and private.can_log_correction_work(c.id,actor,p_work_date)
    ) then raise exception 'Choose the correction cycle for this work'; end if;
    -- Existing entries remain editable if project access changes after logging.
    if not exists (select 1 from public.work_log_entries w where w.studio_id = actor_studio and w.user_id = actor
        and w.work_date = p_work_date and w.task_id = entry.task_id and w.review_round_id is not distinct from entry.review_round_id and w.correction_id is not distinct from entry.correction_id)
      and (not exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id
          where t.id = entry.task_id and p.studio_id = actor_studio and private.can_access_project(p.id))
        or (entry.activity_kind = 'review' and not exists (
          select 1 from public.task_review_round_reviewers rr join public.task_review_rounds r on r.id = rr.round_id
          where rr.round_id = entry.review_round_id and r.task_id = entry.task_id and rr.reviewer_id = actor
        ))) then raise exception 'Work-log activity is unavailable'; end if;
  end loop;
  if exists (select 1 from jsonb_to_recordset(p_entries) as row(activity_kind text, task_id uuid, review_round_id uuid, correction_id uuid, internal_activity_type text)
    group by activity_kind, task_id, review_round_id, correction_id, internal_activity_type having count(*) > 1) then
    raise exception 'Work-log activities must be unique'; end if;
  delete from public.work_log_entries w where w.studio_id = actor_studio and w.user_id = actor
    and w.work_date = p_work_date and (w.activity_kind <> 'internal' or actor_admin) and not exists (
      select 1 from jsonb_to_recordset(p_entries) as row(activity_kind text, task_id uuid, review_round_id uuid, correction_id uuid, internal_activity_type text)
      where row.activity_kind = w.activity_kind and row.task_id is not distinct from w.task_id
        and row.review_round_id is not distinct from w.review_round_id and row.correction_id is not distinct from w.correction_id
        and row.internal_activity_type is not distinct from w.internal_activity_type);
  for entry in select * from jsonb_to_recordset(p_entries)
    as row(activity_kind text, task_id uuid, review_round_id uuid, correction_id uuid, internal_activity_type text, minutes integer) loop
    if entry.activity_kind = 'internal' then
      insert into public.work_log_entries(studio_id, user_id, work_date, activity_kind, internal_activity_type, minutes)
      values (actor_studio, actor, p_work_date, 'internal', entry.internal_activity_type, entry.minutes)
      on conflict (user_id, work_date, internal_activity_type) where activity_kind = 'internal'
      do update set minutes = excluded.minutes, updated_at = clock_timestamp();
    elsif entry.activity_kind = 'task' then
      insert into public.work_log_entries(studio_id, user_id, work_date, activity_kind, task_id, correction_id, minutes)
      values (actor_studio, actor, p_work_date, 'task', entry.task_id, entry.correction_id, entry.minutes)
      on conflict (user_id, work_date, task_id, correction_id) where activity_kind = 'task'
      do update set minutes = excluded.minutes, updated_at = clock_timestamp();
    else
      insert into public.work_log_entries(studio_id, user_id, work_date, activity_kind, task_id, review_round_id, minutes)
      values (actor_studio, actor, p_work_date, 'review', entry.task_id, entry.review_round_id, entry.minutes)
      on conflict (user_id, work_date, task_id, review_round_id)
      do update set minutes = excluded.minutes, updated_at = clock_timestamp();
    end if;
  end loop;
  insert into public.work_log_days(studio_id, user_id, work_date, submitted_at)
  values (actor_studio, actor, p_work_date, clock_timestamp())
  on conflict (studio_id, user_id, work_date) do update set submitted_at = excluded.submitted_at;
end;
$$;
revoke all on function private.save_daily_work_log(date,jsonb) from public,anon,authenticated;

create or replace function public.save_daily_work_log(p_work_date date,p_entries jsonb,p_timer_snapshot jsonb default null)
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
    or exists(select 1 from jsonb_to_recordset(p_entries) as row(activity_kind text,task_id uuid,review_round_id uuid, correction_id uuid,internal_activity_type text)
      group by activity_kind,task_id,review_round_id,correction_id,internal_activity_type having count(*)>1) then raise exception 'Enter unique activities and positive whole minutes'; end if;
  with supplied as (
    select * from jsonb_to_recordset(p_entries) as row(activity_kind text,task_id uuid,review_round_id uuid, correction_id uuid,internal_activity_type text,minutes integer)
  ), adjusted as (
    select e.activity_kind,e.task_id,e.review_round_id,e.correction_id,e.internal_activity_type,e.minutes + coalesce(d.minutes,0) - coalesce((p_timer_snapshot->>e.review_round_id::text)::integer,0) as minutes
    from supplied e left join public.review_timer_daily d on d.user_id=actor and d.work_date=p_work_date and d.round_id=e.review_round_id
    union all
    select 'review',r.task_id,d.round_id,r.correction_id,null::text,d.minutes-coalesce((p_timer_snapshot->>d.round_id::text)::integer,0)
    from public.review_timer_daily d join public.task_review_rounds r on r.id=d.round_id
    where d.user_id=actor and d.work_date=p_work_date and not exists(select 1 from supplied e where e.review_round_id=d.round_id)
      and d.minutes>coalesce((p_timer_snapshot->>d.round_id::text)::integer,0)
  ) select coalesce(jsonb_agg(to_jsonb(adjusted)),'[]'::jsonb) into merged from adjusted;
  perform private.save_daily_work_log(p_work_date,merged);
end;
$$;
revoke all on function public.save_daily_work_log(date,jsonb,jsonb) from public,anon;
grant execute on function public.save_daily_work_log(date,jsonb,jsonb) to authenticated;

create or replace function public.get_work_log_timer_snapshot(p_work_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); studio uuid; synced jsonb; entries jsonb; snapshot jsonb;
begin
  synced:=public.sync_review_timer();
  select studio_id into studio from public.studio_members where user_id=actor and is_active;
  select coalesce(jsonb_agg(jsonb_build_object('activity_kind',activity_kind,'task_id',task_id,'review_round_id',review_round_id,'correction_id',correction_id,'minutes',minutes,'internal_activity_type',internal_activity_type)),'[]'::jsonb)
    into entries from public.work_log_entries where user_id=actor and studio_id=studio and work_date=p_work_date and (activity_kind <> 'internal' or private.is_studio_admin(studio));
  select coalesce(jsonb_object_agg(round_id::text,minutes),'{}'::jsonb) into snapshot
    from public.review_timer_daily where user_id=actor and studio_id=studio and work_date=p_work_date;
  return jsonb_build_object('entries',entries,'timerSnapshot',snapshot,'changed',synced->'changed','studioId',synced->'studioId');
end;
$$;
revoke all on function public.get_work_log_timer_snapshot(date) from public,anon;
grant execute on function public.get_work_log_timer_snapshot(date) to authenticated;

notify pgrst, 'reload schema';

create function private.bind_correction_work_time() returns trigger
language plpgsql security definer set search_path='' as $$
declare cycle uuid;
begin
  if new.review_round_id is not null then
    select correction_id into cycle from public.task_review_rounds where id=new.review_round_id and task_id=new.task_id;
    if new.correction_id is not null and new.correction_id is distinct from cycle then raise exception 'Review time must belong to its correction'; end if;
    new.correction_id:=cycle;
  end if;
  return new;
end; $$;
revoke all on function private.bind_correction_work_time() from public,anon,authenticated;
create trigger bind_correction_work_time before insert or update on public.work_log_entries
  for each row execute function private.bind_correction_work_time();
