-- Existing Board order is due date, creation time, then ID. Preserve it on
-- existing projects; new tasks receive a position as they are inserted.
alter table public.tasks add column stage_position integer;
-- This is a metadata backfill. Avoid task activity and timestamp triggers while
-- the table is locked; application writes use the triggers again afterward.
alter table public.tasks disable trigger user;
with ordered as (
  select id, (row_number() over (
    partition by project_id, stage order by due_date asc nulls last, created_at, id
  ) - 1)::integer as position
  from public.tasks
)
update public.tasks task set stage_position = ordered.position
from ordered where task.id = ordered.id;
alter table public.tasks enable trigger user;
alter table public.tasks alter column stage_position set not null;
alter table public.tasks alter column stage_position set default 0;
alter table public.tasks add constraint tasks_stage_position_nonnegative check (stage_position >= 0);
alter table public.tasks add constraint tasks_project_stage_position_unique
  unique (project_id, stage, stage_position) deferrable initially deferred;

create function private.assign_task_stage_position()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.project_id is not distinct from old.project_id
    and new.stage is not distinct from old.stage then return new; end if;
  -- Match the batch editor's project-then-stage lock order during concurrent creates.
  perform 1 from public.projects where id = new.project_id for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'studioflow:task-order:' || new.project_id::text || ':' || new.stage, 0));
  select coalesce(max(stage_position) + 1, 0) into new.stage_position
  from public.tasks where project_id = new.project_id and stage = new.stage;
  return new;
end;
$$;
revoke execute on function private.assign_task_stage_position() from public, anon, authenticated;
create trigger assign_task_stage_position_before_insert_or_stage_change
  before insert or update of project_id, stage on public.tasks
  for each row execute function private.assign_task_stage_position();

-- Only this guarded operation may reorder tasks. It updates no operational fields.
create function private.set_project_stage_task_order(p_project_id uuid, p_stage text, p_order uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  studio_id uuid;
  task_count integer;
begin
  select project.studio_id into studio_id from public.projects project
  where project.id = p_project_id for update;
  if not found or not coalesce(private.is_studio_admin(studio_id), false)
    or not coalesce(private.can_update_project_task_status(p_project_id, null, p_stage), false) then
    raise exception 'This project stage is read-only or unavailable';
  end if;
  if p_order is null or array_position(p_order, null) is not null
    or cardinality(p_order) <> cardinality(array(select distinct unnest(p_order))) then
    raise exception 'Choose each task only once';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'studioflow:task-order:' || p_project_id::text || ':' || p_stage, 0));
  select count(*) into task_count from public.tasks
    where project_id = p_project_id and stage = p_stage;
  if task_count <> cardinality(p_order) or exists (
    select 1 from public.tasks where project_id = p_project_id and stage = p_stage
      and not (id = any(p_order))
  ) then raise exception 'Stage tasks changed. Reopen the editor before saving' using errcode = '40001'; end if;
  update public.tasks task set stage_position = requested.position - 1
  from unnest(p_order) with ordinality as requested(id, position)
  where task.id = requested.id and task.project_id = p_project_id and task.stage = p_stage
    and task.stage_position is distinct from requested.position - 1;
end;
$$;
revoke execute on function private.set_project_stage_task_order(uuid, text, uuid[]) from public, anon;
grant execute on function private.set_project_stage_task_order(uuid, text, uuid[]) to authenticated;

-- Preserve the batch's existing invoker/RLS semantics; add only its displayed order.
drop function public.save_stage_task_structure(uuid, text, jsonb, jsonb, uuid[]);
-- One transaction for structural setup. Invoker privileges preserve the normal
-- tasks DELETE RLS, foreign keys, audit triggers, and detail/checklist guards.
create or replace function public.save_stage_task_structure(
  p_project_id uuid, p_stage text, p_updates jsonb, p_creates jsonb, p_delete_ids uuid[], p_order uuid[] default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  project_row public.projects%rowtype;
  task_row public.tasks%rowtype;
  source_row public.tasks%rowtype;
  item jsonb;
  checklist jsonb;
  v_template_id uuid;
  source_id uuid;
  prepared_creates jsonb := '[]';
  affected_ids uuid[];
  requested_ids uuid[];
  affected_count integer;
  saved_task_id uuid;
  displayed_order uuid[] := p_order;
begin
  select * into project_row from public.projects where id = p_project_id for update;
  if not found or not coalesce(private.is_studio_admin(project_row.studio_id), false)
    or p_stage is null or p_stage not in ('stage_1','stage_2','stage_3','stage_4')
    or not coalesce(private.can_update_project_task_status(p_project_id, null, p_stage), false) then
    raise exception 'This project stage is read-only or unavailable';
  end if;
  if jsonb_typeof(p_updates) is distinct from 'array' or jsonb_typeof(p_creates) is distinct from 'array'
    or p_delete_ids is null then raise exception 'Invalid stage task batch'; end if;
  if jsonb_array_length(p_creates) > 0 and not exists (
    select 1 from public.project_task_stage_columns where project_id = p_project_id and stage = p_stage
      and is_enabled and 'todo' = any(enabled_statuses)
  ) then raise exception 'Choose an enabled stage that allows new Todo tasks'; end if;

  select coalesce(array_agg((value ->> 'id')::uuid), '{}') || p_delete_ids into affected_ids
  from jsonb_array_elements(p_updates);
  if cardinality(affected_ids) <> cardinality(array(select distinct unnest(affected_ids)))
    or array_position(affected_ids, null) is not null then raise exception 'Choose each task only once'; end if;
  select array(select distinct id from (
    select unnest(affected_ids) as id union all
    select (value ->> 'source_task_id')::uuid from jsonb_array_elements(p_creates)
    where value ->> 'source_task_id' is not null
  ) ids) into requested_ids;
  perform id from public.tasks where id = any(requested_ids) and project_id = p_project_id and stage = p_stage
  order by id for update;
  get diagnostics affected_count = row_count;
  if affected_count <> cardinality(requested_ids) then
    raise exception 'Tasks have changed stage or are no longer available' using errcode = '40001';
  end if;

  for item in select value from jsonb_array_elements(p_updates || p_creates) loop
    if jsonb_typeof(item) is distinct from 'object'
      or char_length(btrim(coalesce(item ->> 'title', ''))) not between 1 and 200
      or not (item ? 'completed_area_m2' and item ? 'checklist_template_id')
      or (item ->> 'completed_area_m2' is not null and not ((item ->> 'completed_area_m2')::numeric > 0
        and (item ->> 'completed_area_m2')::numeric <= 1000000)) then
      raise exception 'Enter a valid task name and area';
    end if;
  end loop;

  if p_order is not null and (array_position(p_order, null) is not null
    or cardinality(p_order) <> cardinality(array(select distinct unnest(p_order))))
    then raise exception 'Choose each task only once'; end if;

  -- Capture sources before deletion; only structural fields ever reach creation.
  for item in select value from jsonb_array_elements(p_creates) loop
    if p_order is not null and item ->> 'client_key' is null then raise exception 'A new task key is required'; end if;
    source_id := (item ->> 'source_task_id')::uuid;
    v_template_id := (item ->> 'checklist_template_id')::uuid;
    select * into source_row from public.tasks where id = source_id;
    if v_template_id is not null and not exists (
      select 1 from public.checklist_templates
      where id = v_template_id and studio_id = project_row.studio_id and archived_at is null
    ) then raise exception 'Choose an active checklist template from this studio'; end if;

    if source_id is not null and v_template_id is not distinct from source_row.checklist_template_id then
      -- Preserve customized/manual checklist structure, with fresh pending items.
      select coalesce(jsonb_agg(jsonb_build_object('title', title, 'weight', weight) order by position, id), '[]')
      into checklist from public.task_checklist_items where task_id = source_id;
    else
      select coalesce(jsonb_agg(jsonb_build_object('title', title, 'weight', weight) order by position, id), '[]')
      into checklist from public.checklist_template_items where template_id = v_template_id;
    end if;
    prepared_creates := prepared_creates || jsonb_build_array(jsonb_build_object('client_key', item ->> 'client_key', 'task', jsonb_build_object(
      'project_id', p_project_id, 'stage', p_stage, 'title', btrim(item ->> 'title'),
      'description', source_row.description, 'priority', 'normal',
      'completed_area_m2', item -> 'completed_area_m2', 'progress_weight', coalesce(source_row.progress_weight, 1),
      'checklist_template_id', v_template_id
    ), 'checklist', checklist));
  end loop;

  -- Identical table operation to normal deletion; never a SECURITY DEFINER bypass.
  delete from public.tasks where id = any(p_delete_ids) and project_id = p_project_id and stage = p_stage;
  get diagnostics affected_count = row_count;
  if affected_count <> cardinality(p_delete_ids) then raise exception 'Tasks could not be deleted'; end if;

  -- Free area before reallocating it so valid batches never exceed the cap midway.
  for item in select value from jsonb_array_elements(p_updates)
    order by coalesce((value ->> 'completed_area_m2')::numeric, 0)
      - coalesce((value -> 'previous' ->> 'completed_area_m2')::numeric, 0)
  loop
    select * into task_row from public.tasks where id = (item ->> 'id')::uuid;
    if jsonb_build_object('title', task_row.title, 'completed_area_m2', task_row.completed_area_m2,
      'checklist_template_id', task_row.checklist_template_id) is distinct from item -> 'previous' then
      raise exception 'Task structure changed. Reopen the editor before saving' using errcode = '40001';
    end if;
    if task_row.checklist_template_id is distinct from (item ->> 'checklist_template_id')::uuid then
      perform public.set_task_checklist_template(task_row.id, (item ->> 'checklist_template_id')::uuid);
    end if;
    update public.tasks set title = btrim(item ->> 'title'), completed_area_m2 = (item ->> 'completed_area_m2')::numeric
    where id = task_row.id and project_id = p_project_id and stage = p_stage;
    if not found then raise exception 'Task details could not be updated'; end if;
  end loop;

  for item in select value from jsonb_array_elements(prepared_creates) loop
    saved_task_id := public.create_task_with_checklist(item -> 'task', item -> 'checklist');
    if p_order is not null then
      displayed_order := array_replace(displayed_order, (item ->> 'client_key')::uuid, saved_task_id);
    end if;
  end loop;
  if p_order is not null then
    perform private.set_project_stage_task_order(p_project_id, p_stage, displayed_order);
  end if;
end;
$$;
revoke execute on function public.save_stage_task_structure(uuid, text, jsonb, jsonb, uuid[], uuid[]) from public, anon;
grant execute on function public.save_stage_task_structure(uuid, text, jsonb, jsonb, uuid[], uuid[]) to authenticated;
