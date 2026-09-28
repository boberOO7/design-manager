-- Template schedules use a stage start date. Dependencies point to earlier
-- tasks in the same stage, so branches and joins reflow deterministically.
alter table public.project_template_tasks
  add column expected_workdays integer check (expected_workdays > 0),
  add column depends_on_positions integer[] not null default '{}';

alter table public.project_task_stage_columns add column schedule_paused_on date;
revoke update on public.project_task_stage_columns from authenticated;
grant update (enabled_statuses) on public.project_task_stage_columns to authenticated;

create table public.task_schedules (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  stage text not null check (stage in ('stage_1', 'stage_2', 'stage_3', 'stage_4')),
  sort_order integer not null,
  expected_workdays integer not null check (expected_workdays > 0),
  baseline_start date not null,
  baseline_due date not null,
  current_start date not null,
  current_due date not null,
  is_blocked boolean not null default false,
  is_paused boolean not null default false,
  unique (project_id, stage, sort_order)
);

create table public.task_schedule_dependencies (
  task_id uuid not null references public.task_schedules(task_id) on delete cascade,
  predecessor_task_id uuid not null references public.task_schedules(task_id) on delete cascade,
  primary key (task_id, predecessor_task_id),
  check (task_id <> predecessor_task_id)
);
create index task_schedule_dependencies_predecessor_idx on public.task_schedule_dependencies(predecessor_task_id);

alter table public.task_schedules enable row level security;
alter table public.task_schedule_dependencies enable row level security;
revoke all on public.task_schedules, public.task_schedule_dependencies from anon, authenticated;
grant select on public.task_schedules, public.task_schedule_dependencies to authenticated;
create policy task_schedules_read on public.task_schedules for select to authenticated
  using ((select private.can_access_project(project_id)));
create policy task_schedule_dependencies_read on public.task_schedule_dependencies for select to authenticated
  using (exists (select 1 from public.task_schedules s where s.task_id = task_schedule_dependencies.task_id
    and private.can_access_project(s.project_id)));

-- New task creation inserts deadlines directly; edits and bulk changes use RPCs.
revoke delete on public.task_deadlines from authenticated;

create or replace function private.schedule_workday_on_or_after(p_day date)
returns date language plpgsql immutable set search_path = '' as $$
begin
  while extract(isodow from p_day) > 5 loop p_day := p_day + 1; end loop;
  return p_day;
end;
$$;
revoke execute on function private.schedule_workday_on_or_after(date) from public, anon, authenticated;

create or replace function private.schedule_add_workdays(p_day date, p_count integer)
returns date language plpgsql immutable set search_path = '' as $$
declare result date := p_day; step integer := case when p_count < 0 then -1 else 1 end; index integer;
begin
  if p_count = 0 then return result; end if;
  -- ponytail: linear in working days; use a calendar table if multi-year task durations become common.
  for index in 1..abs(p_count) loop
    result := result + step;
    while extract(isodow from result) > 5 loop result := result + step; end loop;
  end loop;
  return result;
end;
$$;
revoke execute on function private.schedule_add_workdays(date, integer) from public, anon, authenticated;

create or replace function private.schedule_workdays_elapsed(p_from date, p_until date)
returns integer language sql immutable set search_path = '' as $$
  select count(*)::integer from generate_series(p_from, p_until - 1, interval '1 day') as day
  where extract(isodow from day) <= 5;
$$;
revoke execute on function private.schedule_workdays_elapsed(date, date) from public, anon, authenticated;
alter table public.project_task_stage_columns add column schedule_anchor_date date;

create or replace function public.save_project_template(
  p_studio_id uuid, p_project_type text, p_name text, p_is_active boolean,
  p_is_default boolean, p_tasks jsonb, p_template_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved_template_id uuid;
  normalized_name text := btrim(p_name);
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then raise exception 'Only studio administrators can manage project templates'; end if;
  if p_project_type not in ('private','commercial','horeca','medical','other') then raise exception 'Choose a valid project type'; end if;
  if char_length(normalized_name) not between 1 and 120 or jsonb_typeof(p_tasks) <> 'array' then raise exception 'Provide a valid template name and task list'; end if;
  if p_is_default and not p_is_active then raise exception 'A default template must be active'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_tasks) as task(stage text, title text, priority text,
      checklist_template_id uuid, expected_workdays integer, depends_on_positions integer[])
    where task.stage not in ('stage_1','stage_2','stage_3','stage_4')
      or char_length(btrim(coalesce(task.title,''))) not between 1 and 200
      or task.priority not in ('low','normal','high','urgent')
      or task.expected_workdays <= 0
      or (task.checklist_template_id is not null and not exists (
        select 1 from public.checklist_templates checklist
        where checklist.id = task.checklist_template_id and checklist.studio_id = p_studio_id
      ))
  ) then raise exception 'Each template task needs a valid stage, title, duration, and checklist template'; end if;
  if exists (
    with input as (
      select ordinality::integer - 1 as position, task.stage, task.expected_workdays,
        coalesce(task.depends_on_positions, '{}'::integer[]) as dependencies
      from rows from (jsonb_to_recordset(p_tasks) as (
        stage text, expected_workdays integer, depends_on_positions integer[]
      )) with ordinality as task(stage, expected_workdays, depends_on_positions, ordinality)
    )
    select 1 from input child
    cross join lateral unnest(child.dependencies) as dependency(position)
    left join input predecessor on predecessor.position = dependency.position
    where child.expected_workdays is null or predecessor.stage is distinct from child.stage
      or predecessor.expected_workdays is null or dependency.position >= child.position
  ) or exists (
    select 1 from jsonb_to_recordset(p_tasks) as task(depends_on_positions integer[])
    where cardinality(coalesce(task.depends_on_positions, '{}'::integer[]))
      <> (select count(distinct position) from unnest(coalesce(task.depends_on_positions, '{}'::integer[])) as position)
  ) then raise exception 'Dependencies must reference earlier scheduled tasks in the same stage'; end if;
  if p_is_default then
    update public.project_templates set is_default = false
    where studio_id = p_studio_id and project_type = p_project_type
      and is_default and id is distinct from p_template_id;
  end if;
  if p_template_id is null then
    insert into public.project_templates (studio_id,project_type,name,is_active,is_default,created_by)
    values (p_studio_id,p_project_type,normalized_name,p_is_active,p_is_default,auth.uid())
    returning id into saved_template_id;
  else
    update public.project_templates
    set project_type=p_project_type,name=normalized_name,is_active=p_is_active,is_default=p_is_default
    where id=p_template_id and studio_id=p_studio_id returning id into saved_template_id;
    if saved_template_id is null then raise exception 'Project template was not found'; end if;
    delete from public.project_template_tasks where template_id=saved_template_id;
  end if;
  insert into public.project_template_tasks(
    template_id,stage,title,priority,position,checklist_template_id,expected_workdays,depends_on_positions
  )
  select saved_template_id,task.stage,btrim(task.title),task.priority,task.ordinality-1,
    task.checklist_template_id,task.expected_workdays,
    coalesce(task.depends_on_positions, '{}'::integer[])
  from rows from (jsonb_to_recordset(p_tasks) as (
    stage text,title text,priority text,checklist_template_id uuid,
    expected_workdays integer,depends_on_positions integer[]
  )) with ordinality as task(stage,title,priority,checklist_template_id,expected_workdays,depends_on_positions,ordinality)
  order by task.ordinality;
  if jsonb_array_length(p_tasks) <> (select count(*) from public.project_template_tasks where template_id=saved_template_id)
    then raise exception 'Template tasks could not be saved'; end if;
  return saved_template_id;
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
      values (new_task_id,'completed',task_due);
    end if;
    copied_count := copied_count + 1;
  end loop;
  return copied_count;
end;
$$;
create or replace function private.reflow_task_stage_schedule(p_project_id uuid, p_stage text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  scheduled_task record;
  required_start date;
  blocked boolean;
  next_start date;
  next_due date;
begin
  perform 1 from public.project_task_stage_columns
  where project_id=p_project_id and stage=p_stage for update;
  if exists (select 1 from public.project_task_stage_columns
    where project_id=p_project_id and stage=p_stage and schedule_paused_on is not null) then return; end if;

  for scheduled_task in
    select schedule.*, task.status
    from public.task_schedules schedule
    join public.tasks task on task.id=schedule.task_id
    where schedule.project_id=p_project_id and schedule.stage=p_stage
    order by schedule.sort_order
  loop
    if scheduled_task.status in ('completed','cancelled') then continue; end if;
    select max(private.schedule_add_workdays(
      case when predecessor_task.status='completed' then predecessor_task.completed_at
        else predecessor.current_due end, 1)),
      coalesce(bool_or(predecessor_task.status not in ('completed','cancelled')), false)
    into required_start, blocked
    from public.task_schedule_dependencies dependency
    join public.task_schedules predecessor on predecessor.task_id=dependency.predecessor_task_id
    join public.tasks predecessor_task on predecessor_task.id=predecessor.task_id
    where dependency.task_id=scheduled_task.task_id;

    next_start := greatest(scheduled_task.current_start, coalesce(required_start, scheduled_task.current_start));
    next_due := case when next_start > scheduled_task.current_start
      then private.schedule_add_workdays(scheduled_task.current_due,
        private.schedule_workdays_elapsed(scheduled_task.current_start, next_start))
      else scheduled_task.current_due end;
    if next_start is distinct from scheduled_task.current_start
      or next_due is distinct from scheduled_task.current_due
      or blocked is distinct from scheduled_task.is_blocked then
      update public.task_schedules set current_start=next_start, current_due=next_due, is_blocked=blocked
      where task_id=scheduled_task.task_id;
      update public.task_deadlines set due_date=next_due
      where task_id=scheduled_task.task_id and target_status='completed'
        and due_date is distinct from next_due;
    end if;
  end loop;
end;
$$;
revoke execute on function private.reflow_task_stage_schedule(uuid,text) from public, anon, authenticated;

create or replace function private.reflow_task_schedule_after_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare schedule_project uuid; schedule_stage text;
begin
  if old.status is not distinct from new.status and old.completed_at is not distinct from new.completed_at then return new; end if;
  select project_id,stage into schedule_project,schedule_stage
  from public.task_schedules where task_id=new.id;
  if schedule_project is not null then
    perform private.reflow_task_stage_schedule(schedule_project,schedule_stage);
  end if;
  return new;
end;
$$;
revoke execute on function private.reflow_task_schedule_after_completion() from public,anon,authenticated;
create trigger reflow_task_schedule_after_completion
after update of status, completed_at on public.tasks for each row
execute function private.reflow_task_schedule_after_completion();

create or replace function private.keep_scheduled_task_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage is distinct from old.stage and exists (
    select 1 from public.task_schedules where task_id=old.id
  ) then raise exception 'Scheduled tasks must remain in their stage'; end if;
  return new;
end;
$$;
revoke execute on function private.keep_scheduled_task_stage() from public,anon,authenticated;
create trigger keep_scheduled_task_stage before update of stage on public.tasks
for each row execute function private.keep_scheduled_task_stage();

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
    update public.project_task_stage_columns set schedule_paused_on=current_date
    where project_id=p_project_id and stage=p_stage;
    update public.task_schedules schedule set is_paused=true
    from public.tasks task where task.id=schedule.task_id and task.status not in ('completed','cancelled')
      and schedule.project_id=p_project_id and schedule.stage=p_stage;
    return;
  end if;
  if pause_started is null then return; end if;
  elapsed := private.schedule_workdays_elapsed(pause_started,current_date);
  update public.project_task_stage_columns set schedule_paused_on=null
  where project_id=p_project_id and stage=p_stage;
  update public.task_schedules schedule set
    current_start=private.schedule_add_workdays(schedule.current_start,elapsed),
    current_due=private.schedule_add_workdays(schedule.current_due,elapsed),
    is_paused=false
  from public.tasks task where task.id=schedule.task_id and task.status not in ('completed','cancelled')
    and schedule.project_id=p_project_id and schedule.stage=p_stage;
  update public.task_deadlines deadline set due_date=schedule.current_due
  from public.task_schedules schedule
  join public.tasks task on task.id=schedule.task_id
  where deadline.task_id=schedule.task_id and deadline.target_status='completed'
    and schedule.project_id=p_project_id and schedule.stage=p_stage
    and task.status not in ('completed','cancelled')
    and deadline.due_date is distinct from schedule.current_due;
  perform private.reflow_task_stage_schedule(p_project_id,p_stage);
end;
$$;
revoke execute on function public.set_project_stage_schedule_paused(uuid,text,boolean) from public,anon;
grant execute on function public.set_project_stage_schedule_paused(uuid,text,boolean) to authenticated;
drop function public.apply_project_template_stage(uuid,uuid,text,text);
create function public.apply_project_template_stage(
  p_project_id uuid, p_template_id uuid, p_source_stage text,
  p_destination_stage text, p_anchor_date date
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  project_studio_id uuid;
  project_status text;
  project_archived_at date;
  template_studio_id uuid;
  copied_count integer;
begin
  if p_source_stage not in ('stage_1','stage_2','stage_3','stage_4')
    or p_destination_stage not in ('stage_1','stage_2','stage_3','stage_4') then
    raise exception 'Choose valid source and destination stages';
  end if;
  select project.studio_id,project.status,project.archived_at
  into project_studio_id,project_status,project_archived_at
  from public.projects project where project.id=p_project_id for update;
  if not found or not coalesce(private.is_studio_admin(project_studio_id),false) then
    raise exception 'Only active studio administrators can apply project templates';
  end if;
  if project_archived_at is not null or project_status='archived'
    or (project_status='completed' and p_destination_stage in ('stage_1','stage_2','stage_3')) then
    raise exception 'This project stage is read-only';
  end if;
  if not exists (
    select 1 from public.project_task_stage_columns stage_columns
    where stage_columns.project_id=p_project_id and stage_columns.stage=p_destination_stage
      and stage_columns.is_enabled and 'todo'=any(stage_columns.enabled_statuses)
  ) then raise exception 'The destination stage must be enabled and allow Todo tasks'; end if;
  if exists (select 1 from public.project_task_stage_columns
    where project_id=p_project_id and stage=p_destination_stage and schedule_paused_on is not null)
    then raise exception 'Resume the stage schedule before applying a template'; end if;
  select studio_id into template_studio_id from public.project_templates
  where id=p_template_id and is_active for share;
  if not found or template_studio_id <> project_studio_id then
    raise exception 'Choose an active project template from this studio';
  end if;
  if p_anchor_date is null and exists (
    select 1 from public.project_template_tasks
    where template_id=p_template_id and stage=p_source_stage and expected_workdays is not null
  ) then raise exception 'Choose a stage schedule start date'; end if;
  update public.project_task_stage_columns set schedule_anchor_date=p_anchor_date
  where project_id=p_project_id and stage=p_destination_stage;
  copied_count := private.copy_project_template_stage_tasks(
    p_project_id,p_template_id,p_source_stage,p_destination_stage,null
  );
  if copied_count=0 then raise exception 'The selected template stage has no tasks'; end if;
  return copied_count;
end;
$$;
revoke execute on function public.apply_project_template_stage(uuid,uuid,text,text,date) from public,anon;
grant execute on function public.apply_project_template_stage(uuid,uuid,text,text,date) to authenticated;
alter function public.update_task_details_with_collaborators(uuid,jsonb,uuid[],jsonb)
  set schema private;
revoke execute on function private.update_task_details_with_collaborators(uuid,jsonb,uuid[],jsonb)
  from public,anon,authenticated;

create function public.update_task_details_with_collaborators(
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
    where deadline.target_status='completed';
    if requested_due is null then raise exception 'Scheduled tasks require a Done deadline'; end if;
    if extract(isodow from requested_due) > 5 then raise exception 'Scheduled deadlines must be working days'; end if;
    if schedule.status in ('completed','cancelled') and requested_due <> schedule.current_due then
      raise exception 'Completed task schedule history cannot move';
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
revoke execute on function public.update_task_details_with_collaborators(uuid,jsonb,uuid[],jsonb)
  from public,anon;
grant execute on function public.update_task_details_with_collaborators(uuid,jsonb,uuid[],jsonb)
  to authenticated;

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
  if p_target_status='completed' and exists (
    select 1 from public.task_schedules schedule join public.tasks task on task.id=schedule.task_id
    where schedule.task_id=any(p_task_ids) and (
      extract(isodow from p_due_date)>5
      or p_due_date<private.schedule_add_workdays(schedule.current_start,schedule.expected_workdays-1)
      or (task.status in ('completed','cancelled') and p_due_date<>schedule.current_due)
    )
  ) then raise exception 'Scheduled Done deadline must remain feasible and preserve completed history'; end if;

  delete from public.task_deadlines deadline
  where deadline.task_id=any(p_task_ids) and deadline.target_status=p_target_status;
  return query insert into public.task_deadlines (task_id,target_status,due_date)
  select task_id,p_target_status,p_due_date from unnest(p_task_ids) as task_id
  returning task_deadlines.id;
  if p_target_status='completed' then
    update public.task_schedules set current_due=p_due_date
    where task_id=any(p_task_ids) and current_due is distinct from p_due_date;
    perform private.reflow_task_stage_schedule(p_project_id,p_stage);
  end if;
end;
$$;
revoke execute on function public.bulk_set_project_task_deadline(uuid,text,uuid[],text,date) from public,anon;
grant execute on function public.bulk_set_project_task_deadline(uuid,text,uuid[],text,date) to authenticated;
