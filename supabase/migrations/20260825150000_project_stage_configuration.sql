-- Project stages retain their stable keys; labels and placement are presentation data.
alter table public.projects
  add column include_in_productivity boolean not null default true;

alter table public.project_task_stage_columns
  add column display_name text null check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  add column is_enabled boolean not null default true,
  add column display_order smallint null;

update public.project_task_stage_columns
set display_order = case stage
  when 'stage_1' then 1 when 'stage_2' then 2 when 'stage_3' then 3 else 4 end;

do $$
begin
  if exists (
    select 1 from public.project_task_stage_columns
    where display_order is null or display_order not between 1 and 4
  ) then raise exception 'Project stage display order backfill failed'; end if;
end;
$$;

alter table public.project_task_stage_columns
  alter column display_order set not null,
  add constraint project_task_stage_columns_display_order_check
    check (display_order between 1 and 4);

-- New project rows are created by this existing trigger, so set each stable
-- stage's order explicitly rather than relying on a default.
create or replace function private.create_project_task_stage_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_task_stage_columns (project_id, stage, display_order)
  values (new.id, 'stage_1', 1), (new.id, 'stage_2', 2),
         (new.id, 'stage_3', 3), (new.id, 'stage_4', 4);
  return new;
end;
$$;
revoke execute on function private.create_project_task_stage_columns() from public, anon, authenticated;

create or replace function private.prevent_invalid_project_stage_configuration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_enabled and exists (
    select 1 from public.tasks
    where project_id = new.project_id and stage = new.stage
      and status not in ('completed', 'cancelled')
  ) then
    raise exception 'Move active tasks from this stage before disabling it';
  end if;
  return new;
end;
$$;
revoke execute on function private.prevent_invalid_project_stage_configuration() from public, anon, authenticated;

create trigger prevent_invalid_project_stage_configuration_before_update
before update of is_enabled on public.project_task_stage_columns
for each row execute function private.prevent_invalid_project_stage_configuration();

create or replace function private.ensure_project_has_enabled_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.project_task_stage_columns
    where project_id = new.project_id and is_enabled
  ) then raise exception 'A project must have at least one enabled stage'; end if;
  return new;
end;
$$;
revoke execute on function private.ensure_project_has_enabled_stage() from public, anon, authenticated;
create constraint trigger ensure_project_has_enabled_stage_after_update
after update of is_enabled on public.project_task_stage_columns
deferrable initially deferred for each row execute function private.ensure_project_has_enabled_stage();

create or replace function public.update_project_stage_configuration(
  p_project_id uuid,
  p_stages jsonb,
  p_include_in_productivity boolean
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  stage_count integer;
  enabled_count integer;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id and private.is_studio_admin(studio_id)
  ) then raise exception 'Only active studio administrators can configure project stages'; end if;
  if jsonb_typeof(p_stages) <> 'array' then raise exception 'Choose valid project stages'; end if;
  select count(*), count(*) filter (where is_enabled)
  into stage_count, enabled_count
  from jsonb_to_recordset(p_stages) as entry(stage text, display_name text, is_enabled boolean, display_order smallint);
  if stage_count <> 4 or enabled_count < 1
    or exists (
      select 1 from jsonb_to_recordset(p_stages) as entry(stage text, display_name text, is_enabled boolean, display_order smallint)
      where stage not in ('stage_1','stage_2','stage_3','stage_4')
         or display_name is null or char_length(btrim(display_name)) not between 1 and 80
         or is_enabled is null or display_order not between 1 and 4
    )
    or (select count(distinct stage) from jsonb_to_recordset(p_stages) as entry(stage text)) <> 4
    or (select count(distinct display_order) from jsonb_to_recordset(p_stages) as entry(display_order smallint)) <> 4
  then raise exception 'Choose four valid stages with at least one enabled stage'; end if;

  if exists (
    select 1 from public.tasks task
    join jsonb_to_recordset(p_stages) as entry(stage text, is_enabled boolean) on entry.stage = task.stage
    where task.project_id = p_project_id and not entry.is_enabled
      and task.status not in ('completed', 'cancelled')
  ) then raise exception 'Move active tasks from this stage before disabling it'; end if;

  update public.project_task_stage_columns current
  set display_name = btrim(entry.display_name), is_enabled = entry.is_enabled,
      display_order = entry.display_order, updated_at = now()
  from jsonb_to_recordset(p_stages) as entry(stage text, display_name text, is_enabled boolean, display_order smallint)
  where current.project_id = p_project_id and current.stage = entry.stage;
  update public.projects set include_in_productivity = p_include_in_productivity where id = p_project_id;
end;
$$;
revoke execute on function public.update_project_stage_configuration(uuid, jsonb, boolean) from public, anon;
grant execute on function public.update_project_stage_configuration(uuid, jsonb, boolean) to authenticated;

-- The stage table already grants authenticated users the RLS-scoped SELECT and
-- UPDATE access this SECURITY INVOKER RPC needs. Projects uses column grants,
-- so grant only the newly written configuration flag.
grant update (include_in_productivity) on table public.projects to authenticated;
