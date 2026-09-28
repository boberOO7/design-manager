-- Snapshot old dates before converting Done-based schedules. A prior review
-- completion may have been voided on reopen, but its original due date remains.
create temporary table schedule_review_before_migration as
select schedule.task_id,schedule.current_due as old_due,
  review.due_date as old_review_due
from public.task_schedules schedule
left join public.task_deadlines review on review.task_id=schedule.task_id
  and review.target_status='internal_review';

delete from public.task_deadlines deadline
using public.task_schedules schedule
where deadline.task_id=schedule.task_id and deadline.target_status='completed'
  and exists (select 1 from public.task_deadlines review
    where review.task_id=deadline.task_id and review.target_status='internal_review');

update public.task_deadlines deadline set target_status='internal_review'
from public.task_schedules schedule
where deadline.task_id=schedule.task_id and deadline.target_status='completed';

-- Unfinished work cannot lose its duration or move earlier during conversion.
update public.task_schedules schedule set current_due=case
  when task.status in ('completed','cancelled') or exists (
    select 1 from public.task_status_periods period
    where period.task_id=schedule.task_id and period.status='internal_review'
  ) then deadline.due_date
  else greatest(schedule.current_due,deadline.due_date,
    private.schedule_add_workdays(schedule.current_start,schedule.expected_workdays-1))
  end
from public.task_deadlines deadline
join public.tasks task on task.id=deadline.task_id
where deadline.task_id=schedule.task_id and deadline.target_status='internal_review'
  and schedule.current_due is distinct from deadline.due_date;

update public.task_deadlines deadline set due_date=schedule.current_due
from public.task_schedules schedule
join public.tasks task on task.id=schedule.task_id
where deadline.task_id=schedule.task_id and deadline.target_status='internal_review'
  and deadline.due_date is distinct from schedule.current_due
  and task.status not in ('completed','cancelled')
  and not exists (select 1 from public.task_status_periods period
    where period.task_id=schedule.task_id and period.status='internal_review');

-- Match a completion to the first real review entry. Keep its original
-- assignee and row when it is already the active milestone.
create temporary table schedule_first_review_before_migration as
select snapshot.task_id,first_review.entered_at,
  first_record.id as completion_id,first_record.due_date,first_record.assignee_id
from schedule_review_before_migration snapshot
left join lateral (
  select entered_at,exited_at from public.task_status_periods
  where task_id=snapshot.task_id and status='internal_review'
  order by entered_at limit 1
) first_review on true
left join lateral (
  select status from public.task_status_periods
  where task_id=snapshot.task_id and exited_at<=first_review.entered_at
  order by exited_at desc limit 1
) previous_period on true
left join lateral (
  select id,due_date,assignee_id from public.task_deadline_completions
  where task_id=snapshot.task_id and target_status='internal_review'
    and completed_on=(first_review.entered_at at time zone 'Europe/Kyiv')::date
    and (first_review.exited_at is null or completed_at<first_review.exited_at)
    and (previous_period.status is null or previous_period.status in ('todo','in_progress'))
  order by abs(extract(epoch from (completed_at-first_review.entered_at))),id limit 1
) first_record on true;

update public.task_deadline_completions completion set voided_at=now()
from schedule_first_review_before_migration first_review
where completion.task_id=first_review.task_id
  and completion.target_status='internal_review' and completion.voided_at is null
  and completion.id is distinct from first_review.completion_id;

insert into public.task_deadline_completions
  (studio_id,project_id,task_id,assignee_id,target_status,due_date,completed_at,completed_on)
select project.studio_id,schedule.project_id,schedule.task_id,first_review.assignee_id,
  'internal_review',
  coalesce(first_review.due_date,snapshot.old_review_due,snapshot.old_due),
  first_review.entered_at,(first_review.entered_at at time zone 'Europe/Kyiv')::date
from public.task_schedules schedule
join schedule_review_before_migration snapshot on snapshot.task_id=schedule.task_id
join schedule_first_review_before_migration first_review on first_review.task_id=schedule.task_id
join public.projects project on project.id=schedule.project_id
where first_review.entered_at is not null
  and not exists (select 1 from public.task_deadline_completions completion
    where completion.task_id=schedule.task_id and completion.target_status='internal_review'
      and completion.voided_at is null);

update public.task_schedules schedule set is_blocked=false
from public.tasks task
where task.id=schedule.task_id and schedule.is_blocked
  and (task.status in ('completed','cancelled') or exists (
    select 1 from public.task_status_periods period
    where period.task_id=task.id and period.status='internal_review'));

create or replace function private.record_task_deadline_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare milestone text; milestone_order integer; old_order integer; new_order integer; task_studio_id uuid;
begin
  old_order := case old.status when 'todo' then 0 when 'in_progress' then 1 when 'internal_review' then 2 when 'review' then 3 when 'completed' then 4 else -1 end;
  new_order := case new.status when 'todo' then 0 when 'in_progress' then 1 when 'internal_review' then 2 when 'review' then 3 when 'completed' then 4 else -1 end;
  if new_order = old_order then return new; end if;
  select studio_id into task_studio_id from public.projects where id=new.project_id;
  if task_studio_id is null then raise exception 'Task project no longer exists'; end if;

  update public.task_deadline_completions completion set voided_at=now()
  where completion.task_id=new.id and completion.voided_at is null
    and (case completion.target_status when 'internal_review' then 2 when 'review' then 3 when 'completed' then 4 end)>new_order
    and not (completion.target_status='internal_review' and exists (
      select 1 from public.task_schedules where task_id=new.id));

  for milestone,milestone_order in
    select deadline.target_status,case deadline.target_status when 'internal_review' then 2 when 'review' then 3 when 'completed' then 4 end
    from public.task_deadlines deadline where deadline.task_id=new.id
  loop
    if ((milestone_order>old_order and milestone_order<=new_order)
        or (milestone='internal_review' and new.status='internal_review'
          and old.status is distinct from new.status))
      and (milestone<>'internal_review' or not exists (
        select 1 from public.task_schedules where task_id=new.id
      ) or new.status='internal_review') then
      insert into public.task_deadline_completions
        (studio_id,project_id,task_id,assignee_id,target_status,due_date)
      select task_studio_id,new.project_id,new.id,new.assignee_id,deadline.target_status,deadline.due_date
      from public.task_deadlines deadline
      where deadline.task_id=new.id and deadline.target_status=milestone
      on conflict (task_id,target_status) where voided_at is null do nothing;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function private.reflow_task_stage_schedule(p_project_id uuid,p_stage text)
returns void language plpgsql security definer set search_path = '' as $$
declare scheduled_task record; required_start date; blocked boolean; next_start date; next_due date;
begin
  perform 1 from public.project_task_stage_columns
  where project_id=p_project_id and stage=p_stage for update;
  update public.task_schedules schedule set is_blocked=false
  from public.tasks task
  where task.id=schedule.task_id and schedule.project_id=p_project_id
    and schedule.stage=p_stage and schedule.is_blocked
    and (task.status in ('completed','cancelled') or exists (
      select 1 from public.task_status_periods period
      where period.task_id=task.id and period.status='internal_review'));
  if exists (select 1 from public.project_task_stage_columns
    where project_id=p_project_id and stage=p_stage and schedule_paused_on is not null) then return; end if;

  for scheduled_task in
    select schedule.*,task.status,
      exists (select 1 from public.task_status_periods period
        where period.task_id=schedule.task_id and period.status='internal_review') as handed_off
    from public.task_schedules schedule
    join public.tasks task on task.id=schedule.task_id
    where schedule.project_id=p_project_id and schedule.stage=p_stage
    order by schedule.sort_order
  loop
    if scheduled_task.handed_off or scheduled_task.status in ('completed','cancelled') then continue; end if;
    select max(private.schedule_add_workdays(
      case when first_review.entered_at is not null
        then (first_review.entered_at at time zone 'Europe/Kyiv')::date
        when predecessor_task.status in ('completed','cancelled') then predecessor.current_due
        else greatest(predecessor.current_due,
          private.schedule_workday_on_or_after((now() at time zone 'Europe/Kyiv')::date)) end,1)),
      coalesce(bool_or(first_review.entered_at is null
        and predecessor_task.status not in ('completed','cancelled')),false)
    into required_start,blocked
    from public.task_schedule_dependencies dependency
    join public.task_schedules predecessor on predecessor.task_id=dependency.predecessor_task_id
    join public.tasks predecessor_task on predecessor_task.id=predecessor.task_id
    left join lateral (
      select min(entered_at) as entered_at from public.task_status_periods
      where task_id=predecessor.task_id and status='internal_review'
    ) first_review on true
    where dependency.task_id=scheduled_task.task_id;

    next_start := greatest(scheduled_task.current_start,coalesce(required_start,scheduled_task.current_start));
    next_due := case when next_start>scheduled_task.current_start
      then private.schedule_add_workdays(scheduled_task.current_due,
        private.schedule_workdays_elapsed(scheduled_task.current_start,next_start))
      else scheduled_task.current_due end;
    if next_start is distinct from scheduled_task.current_start
      or next_due is distinct from scheduled_task.current_due
      or blocked is distinct from scheduled_task.is_blocked then
      update public.task_schedules set current_start=next_start,current_due=next_due,is_blocked=blocked
      where task_id=scheduled_task.task_id;
      update public.task_deadlines set due_date=next_due
      where task_id=scheduled_task.task_id and target_status='internal_review'
        and due_date is distinct from next_due;
    end if;
  end loop;
end;
$$;

create or replace function private.validate_scheduled_milestone_date()
returns trigger language plpgsql security definer set search_path = '' as $$
declare first_workday date;
begin
  if new.target_status='internal_review' then return new; end if;
  select current_start into first_workday from public.task_schedules where task_id=new.task_id;
  if first_workday is not null and new.due_date<first_workday then
    raise exception 'Milestone deadline cannot precede scheduled work';
  end if;
  return new;
end;
$$;

create or replace function private.shift_scheduled_task_milestones()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.current_start<=old.current_start then return new; end if;
  update public.task_deadlines deadline
  set due_date=private.schedule_add_workdays(
    deadline.due_date,private.schedule_workdays_elapsed(old.current_start,new.current_start))
  where deadline.task_id=new.task_id and deadline.target_status<>'internal_review'
    and not exists (select 1 from public.task_deadline_completions completion
      where completion.task_id=deadline.task_id
        and completion.target_status=deadline.target_status and completion.voided_at is null);
  return new;
end;
$$;

create or replace function private.copy_project_template_stage_tasks(
  p_project_id uuid, p_template_id uuid, p_source_stage text,
  p_destination_stage text, p_assignee_id uuid default null
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  template_task record;
  predecessor_position integer;
  predecessor_task_id uuid;
  new_task_id uuid;
  copied_count integer := 0;
  mapped_tasks jsonb := '{}'::jsonb;
  anchor date;
  task_start date;
  task_due date;
  next_order integer;
begin
  select coalesce(stage_columns.schedule_anchor_date, project.start_date),
    coalesce(max(schedule.sort_order), -1) + 1
  into anchor, next_order
  from public.projects project
  join public.project_task_stage_columns stage_columns
    on stage_columns.project_id = project.id and stage_columns.stage = p_destination_stage
  left join public.task_schedules schedule
    on schedule.project_id = project.id and schedule.stage = p_destination_stage
  where project.id = p_project_id
  group by stage_columns.schedule_anchor_date, project.start_date;

  for template_task in
    select id, title, checklist_template_id, expected_workdays, depends_on_positions, position
    from public.project_template_tasks
    where template_id = p_template_id and stage = p_source_stage
    order by position, id
  loop
    insert into public.tasks (project_id,title,priority,assignee_id,created_by,stage,status)
    values (p_project_id,template_task.title,'normal',p_assignee_id,auth.uid(),p_destination_stage,'todo')
    returning id into new_task_id;
    mapped_tasks := mapped_tasks || jsonb_build_object(template_task.position::text, new_task_id);

    insert into public.task_checklist_items (task_id,title,weight,position)
    select new_task_id,item.title,item.weight,item.position
    from public.checklist_template_items item
    where item.template_id = template_task.checklist_template_id
    order by item.position,item.id;

    if template_task.expected_workdays is not null then
      if anchor is null then raise exception 'A schedule start date is required'; end if;
      task_start := private.schedule_workday_on_or_after(anchor);
      foreach predecessor_position in array template_task.depends_on_positions loop
        predecessor_task_id := (mapped_tasks ->> predecessor_position::text)::uuid;
        if predecessor_task_id is null then raise exception 'Invalid template dependency'; end if;
        select greatest(task_start, private.schedule_add_workdays(predecessor.baseline_due, 1))
        into task_start from public.task_schedules predecessor where predecessor.task_id = predecessor_task_id;
      end loop;
      task_due := private.schedule_add_workdays(task_start, template_task.expected_workdays - 1);
      insert into public.task_schedules(
        task_id,project_id,stage,sort_order,expected_workdays,
        baseline_start,baseline_due,current_start,current_due,is_paused
      ) values (
        new_task_id,p_project_id,p_destination_stage,next_order,template_task.expected_workdays,
        task_start,task_due,task_start,task_due,
        exists (select 1 from public.project_task_stage_columns
          where project_id=p_project_id and stage=p_destination_stage and schedule_paused_on is not null)
      );
      next_order := next_order + 1;
      foreach predecessor_position in array template_task.depends_on_positions loop
        insert into public.task_schedule_dependencies (task_id,predecessor_task_id)
        values (new_task_id,(mapped_tasks ->> predecessor_position::text)::uuid);
      end loop;
      insert into public.task_deadlines (task_id,target_status,due_date)
      values (new_task_id,'internal_review',task_due);
    end if;
    copied_count := copied_count + 1;
  end loop;
  return copied_count;
end;
$$;

create or replace function public.update_task_details_with_collaborators(
  p_task_id uuid, p_task jsonb, p_collaborator_ids uuid[] default '{}',
  p_deadlines jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  schedule record;
  requested_due date;
  has_schedule boolean := false;
begin
  select s.*, task.status into schedule
  from public.task_schedules s join public.tasks task on task.id=s.task_id
  where s.task_id=p_task_id;
  has_schedule := found;
  if has_schedule and p_deadlines is not null then
    select deadline.due_date into requested_due
    from jsonb_to_recordset(p_deadlines) as deadline(target_status text,due_date date)
    where deadline.target_status='internal_review';
    if requested_due is null then raise exception 'Scheduled tasks require an internal review deadline'; end if;
    if extract(isodow from requested_due) > 5 then raise exception 'Scheduled deadlines must be working days'; end if;
    if (schedule.status in ('completed','cancelled') or exists (
      select 1 from public.task_status_periods
      where task_id=p_task_id and status='internal_review'
    )) and requested_due <> schedule.current_due then
      raise exception 'Reached task schedule history cannot move';
    end if;
    if requested_due < private.schedule_add_workdays(schedule.current_start,schedule.expected_workdays-1)
      then raise exception 'Deadline is earlier than this task can finish'; end if;
  end if;

  perform private.update_task_details_with_collaborators(
    p_task_id,p_task,p_collaborator_ids,p_deadlines
  );
  if has_schedule and p_deadlines is not null
    and requested_due is distinct from schedule.current_due then
    update public.task_schedules set current_due=requested_due where task_id=p_task_id;
    perform private.reflow_task_stage_schedule(schedule.project_id,schedule.stage);
  end if;
end;
$$;

create or replace function public.bulk_set_project_task_deadline(
  p_project_id uuid, p_stage text, p_task_ids uuid[],
  p_target_status text, p_due_date date
) returns table (id uuid) language plpgsql security definer set search_path = '' as $$
declare project_studio_id uuid; project_status text; project_archived_at date;
  selected_count integer;
begin
  if p_stage not in ('stage_1','stage_2','stage_3','stage_4')
    or p_target_status not in ('internal_review','review','completed')
    or p_due_date is null or coalesce(cardinality(p_task_ids),0)=0
    or cardinality(p_task_ids)>200
    or cardinality(p_task_ids)<>(select count(distinct task_id) from unnest(p_task_ids) as task_id) then
    raise exception 'Choose a valid task batch, workflow milestone, and deadline';
  end if;
  select studio_id,status,archived_at into project_studio_id,project_status,project_archived_at
  from public.projects where projects.id=p_project_id for update;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id),false) then
    raise exception 'Only active studio administrators can edit task deadlines';
  end if;
  if project_archived_at is not null or project_status='archived'
    or (project_status='completed' and p_stage in ('stage_1','stage_2','stage_3')) then
    raise exception 'This project stage is read-only';
  end if;
  perform 1 from public.tasks task where task.id=any(p_task_ids) order by task.id for update;
  select count(*) into selected_count from public.tasks task
  where task.id=any(p_task_ids) and task.project_id=p_project_id and task.stage=p_stage;
  if selected_count<>cardinality(p_task_ids) then
    raise exception 'Every selected task must still be available in this project stage';
  end if;
  if p_target_status='internal_review' and exists (
    select 1 from public.task_schedules schedule join public.tasks task on task.id=schedule.task_id
    where schedule.task_id=any(p_task_ids) and (
      extract(isodow from p_due_date)>5
      or p_due_date<private.schedule_add_workdays(schedule.current_start,schedule.expected_workdays-1)
      or ((task.status in ('completed','cancelled') or exists (
        select 1 from public.task_status_periods
        where task_id=schedule.task_id and status='internal_review'
      )) and p_due_date<>schedule.current_due)
    )
  ) then raise exception 'Scheduled internal review deadline must remain feasible and preserve reached history'; end if;

  delete from public.task_deadlines deadline
  where deadline.task_id=any(p_task_ids) and deadline.target_status=p_target_status;
  return query insert into public.task_deadlines (task_id,target_status,due_date)
  select task_id,p_target_status,p_due_date from unnest(p_task_ids) as task_id
  returning task_deadlines.id;
  if p_target_status='internal_review' then
    update public.task_schedules set current_due=p_due_date
    where task_id=any(p_task_ids) and current_due is distinct from p_due_date;
    perform private.reflow_task_stage_schedule(p_project_id,p_stage);
  end if;
end;
$$;

create or replace function public.set_project_stage_schedule_paused(
  p_project_id uuid, p_stage text, p_paused boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare project_studio_id uuid; project_status text; project_archived_at date;
  pause_started date; elapsed integer;
begin
  if p_stage not in ('stage_1','stage_2','stage_3','stage_4') or p_paused is null then
    raise exception 'Choose a valid stage pause action';
  end if;
  select studio_id,status,archived_at into project_studio_id,project_status,project_archived_at
  from public.projects where id=p_project_id for update;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id),false) then
    raise exception 'Only active studio administrators can pause stage schedules';
  end if;
  if project_archived_at is not null or project_status='archived'
    or (project_status='completed' and p_stage in ('stage_1','stage_2','stage_3')) then
    raise exception 'This project stage is read-only';
  end if;
  select schedule_paused_on into pause_started
  from public.project_task_stage_columns
  where project_id=p_project_id and stage=p_stage for update;
  if p_paused then
    if pause_started is not null then return; end if;
    update public.project_task_stage_columns set schedule_paused_on=(now() at time zone 'Europe/Kyiv')::date
    where project_id=p_project_id and stage=p_stage;
    update public.task_schedules schedule set is_paused=true
    from public.tasks task where task.id=schedule.task_id and task.status not in ('completed','cancelled')
      and not exists (select 1 from public.task_status_periods period
        where period.task_id=task.id and period.status='internal_review')
      and schedule.project_id=p_project_id and schedule.stage=p_stage;
    return;
  end if;
  if pause_started is null then return; end if;
  elapsed := private.schedule_workdays_elapsed(pause_started,(now() at time zone 'Europe/Kyiv')::date);
  update public.project_task_stage_columns set schedule_paused_on=null
  where project_id=p_project_id and stage=p_stage;
  update public.task_schedules schedule set
    current_start=private.schedule_add_workdays(schedule.current_start,elapsed),
    current_due=private.schedule_add_workdays(schedule.current_due,elapsed),
    is_paused=false
  from public.tasks task where task.id=schedule.task_id and task.status not in ('completed','cancelled')
      and not exists (select 1 from public.task_status_periods period
        where period.task_id=task.id and period.status='internal_review')
    and schedule.project_id=p_project_id and schedule.stage=p_stage;
  update public.task_deadlines deadline set due_date=schedule.current_due
  from public.task_schedules schedule
  join public.tasks task on task.id=schedule.task_id
  where deadline.task_id=schedule.task_id and deadline.target_status='internal_review'
    and schedule.project_id=p_project_id and schedule.stage=p_stage
    and task.status not in ('completed','cancelled')
      and not exists (select 1 from public.task_status_periods period
        where period.task_id=task.id and period.status='internal_review')
    and deadline.due_date is distinct from schedule.current_due;
  perform private.reflow_task_stage_schedule(p_project_id,p_stage);
end;
$$;


-- Conversion can move unfinished upstream due dates; carry that change through
-- each stage before the new schedule is read.
do $$
declare stage_row record;
begin
  for stage_row in
    select distinct schedule.project_id,schedule.stage
    from public.task_schedules schedule
    join schedule_review_before_migration snapshot on snapshot.task_id=schedule.task_id
    join public.projects project on project.id=schedule.project_id
    where schedule.current_due>snapshot.old_due
      and project.archived_at is null and project.status<>'archived'
      and (project.status<>'completed' or schedule.stage='stage_4')
  loop
    perform private.reflow_task_stage_schedule(stage_row.project_id,stage_row.stage);
  end loop;
end;
$$;
drop table schedule_first_review_before_migration;
drop table schedule_review_before_migration;
