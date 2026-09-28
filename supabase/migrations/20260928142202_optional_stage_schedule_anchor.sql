-- Preserve unscheduled stage-template application without requiring a date.
create or replace function public.apply_project_template_stage(
  p_project_id uuid, p_template_id uuid, p_source_stage text,
  p_destination_stage text, p_anchor_date date default null
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
