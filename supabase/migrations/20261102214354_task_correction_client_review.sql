-- Follow the configured primary workflow after reviewer approval without reopening task completion.
-- Existing closed correction cycles and all original productivity snapshots remain unchanged.
alter table public.task_corrections drop constraint task_corrections_status_check;
alter table public.task_corrections add constraint task_corrections_status_check
  check(status in ('in_progress','internal_review','review','closed'));

CREATE OR REPLACE FUNCTION public.update_task_correction(p_task_id uuid, p_action text, p_correction_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_assignee_id uuid DEFAULT NULL::uuid, p_due_date date DEFAULT NULL::date, p_reviewer_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare task public.tasks%rowtype; project public.projects%rowtype; correction public.task_corrections%rowtype;
  actor uuid:=auth.uid(); is_admin boolean; enabled text[]; destination text; chosen uuid[]; person uuid; round_id uuid;
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
    if not found then raise exception 'Correction unavailable'; end if;
    if not is_admin and correction.assignee_id<>actor then raise exception 'Only the correction assignee or administrator can update it'; end if;
    if p_action in ('complete','resume') then
      if correction.status<>'review' then raise exception 'Resolve the client review before moving this correction'; end if;
      select enabled_statuses into enabled from public.project_task_stage_columns where project_id=task.project_id and stage=task.stage for share;
      destination:=case when p_action='complete' then 'completed' else 'in_progress' end;
      if not coalesce(destination=any(enabled),false) then raise exception 'Choose a status enabled for this task stage'; end if;
      update public.task_corrections set status=case when p_action='complete' then 'closed' else 'in_progress' end,
        closed_at=case when p_action='complete' then clock_timestamp() else null end,updated_at=clock_timestamp() where id=correction.id;
      return correction.id;
    end if;
    if correction.status<>'in_progress' then raise exception 'This correction is no longer in progress'; end if;
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
end; $function$;

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
    next_status := case when p_action = 'rework' then 'in_progress' when 'review' = any(enabled) then 'review' when 'completed' = any(enabled) then 'completed' end;
    if next_status is null then raise exception 'Enable a workflow status after Internal review'; end if;
    update public.task_review_rounds set result = p_action, completed_at = clock_timestamp(),
      rework_comment = case when p_action = 'rework' then btrim(p_comment) else null end where id = round.id;
    if correction.id is not null then
      update public.task_corrections set status=case when next_status='completed' then 'closed' else next_status end,
        closed_at=case when next_status='completed' then clock_timestamp() else null end,updated_at=clock_timestamp() where id=correction.id;
    else
      update public.tasks set status = next_status where id = task.id;
    end if;
  else raise exception 'Choose a valid review action';
  end if;
end;$function$;

revoke all on function public.update_task_correction(uuid,text,uuid,text,uuid,date,uuid[]) from public,anon;
grant execute on function public.update_task_correction(uuid,text,uuid,text,uuid,date,uuid[]) to authenticated;
revoke all on function public.update_task_review(uuid,text,uuid,boolean,uuid,text,uuid[],uuid) from public,anon;
grant execute on function public.update_task_review(uuid,text,uuid,boolean,uuid,text,uuid[],uuid) to authenticated;
notify pgrst,'reload schema';
