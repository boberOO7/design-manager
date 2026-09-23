alter table public.projects
  add column show_progress boolean not null default true;

grant select (show_progress), update (show_progress) on table public.projects to authenticated;

drop function public.update_project_stage_configuration(uuid, jsonb, boolean);

create or replace function public.update_project_stage_configuration(
  p_project_id uuid,
  p_stages jsonb,
  p_include_in_productivity boolean,
  p_show_progress boolean
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
  if p_include_in_productivity is null or p_show_progress is null then raise exception 'Choose valid project settings'; end if;
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
  update public.projects set include_in_productivity = p_include_in_productivity, show_progress = p_show_progress where id = p_project_id;
end;
$$;
revoke execute on function public.update_project_stage_configuration(uuid, jsonb, boolean, boolean) from public, anon;
grant execute on function public.update_project_stage_configuration(uuid, jsonb, boolean, boolean) to authenticated;
