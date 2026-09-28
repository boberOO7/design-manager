-- Stage 4 stays operational after project completion.
create or replace function public.refresh_project_task_schedules(p_project_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare scheduled_project uuid; scheduled_stage text;
begin
  for scheduled_project in select distinct unnest(p_project_ids) loop
    if not coalesce(private.can_access_project(scheduled_project),false) then
      raise exception 'Project schedule is not accessible';
    end if;
    for scheduled_stage in
      select distinct schedule.stage
      from public.task_schedules schedule
      join public.projects project on project.id=schedule.project_id
      where schedule.project_id=scheduled_project
        and project.archived_at is null and project.status <> 'archived'
        and (project.status <> 'completed' or schedule.stage='stage_4')
      order by schedule.stage
    loop
      perform private.reflow_task_stage_schedule(scheduled_project,scheduled_stage);
    end loop;
  end loop;
end;
$$;
