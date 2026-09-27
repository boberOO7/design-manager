-- Backfill only zero-area completions whose original task, contributor, and date
-- snapshots are corroborated by the task audit and untouched source records.
create or replace function private.backfill_audited_zero_area_task_attributions()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  inserted_count integer;
begin
with completion as (
  select activity.id, activity.entity_id as task_id, activity.project_id, activity.studio_id,
    activity.created_at as entered_at, activity.changes
  from public.project_activity as activity
  where activity.entity_type = 'task'
    and activity.action_type = 'task_updated'
    and activity.changes #>> '{status,to}' = 'completed'
    and activity.changes #>> '{status,from}' is distinct from 'completed'
), verified as (
  select task.id as task_id, project.id as project_id, project.studio_id,
    task.stage, task.completed_at, task.assignee_id, profile.full_name, profile.job_title
  from completion
  inner join public.tasks as task on task.id = completion.task_id
    and task.project_id = completion.project_id
  inner join public.projects as project on project.id = task.project_id
    and project.studio_id = completion.studio_id
  inner join public.task_status_periods as period on period.task_id = task.id
    and period.status = 'completed' and period.exited_at is null
    and period.entered_at = completion.entered_at
    and period.project_id = project.id and period.studio_id = project.studio_id
  inner join public.profiles as profile on profile.id = task.assignee_id
    and profile.is_active and profile.updated_at < completion.entered_at
  inner join public.project_members as member on member.project_id = project.id
    and member.user_id = task.assignee_id and member.is_active
    and member.created_at < completion.entered_at and member.updated_at < completion.entered_at
  inner join public.studio_members as studio_member on studio_member.studio_id = project.studio_id
    and studio_member.user_id = task.assignee_id and studio_member.is_active
  inner join lateral (
    select case
      when assignment.action_type = 'task_created' then (assignment.changes ->> 'assignee_id')::uuid
      else (assignment.changes #>> '{assignee_id,to}')::uuid
    end as assignee_id
    from public.project_activity as assignment
    where assignment.entity_type = 'task' and assignment.entity_id = task.id
      and ((assignment.action_type = 'task_created' and assignment.changes ? 'assignee_id')
        or (assignment.action_type = 'task_updated' and assignment.changes ? 'assignee_id'))
      and (assignment.created_at, assignment.id) <= (completion.entered_at, completion.id)
    order by assignment.created_at desc, assignment.id desc
    limit 1
  ) as assignment on assignment.assignee_id = task.assignee_id
  where task.status = 'completed' and task.stage in ('stage_1', 'stage_2', 'stage_3')
    and task.productivity_area_m2 = 0
    and task.updated_at = completion.entered_at
    and completion.changes #>> '{completed_at,to}' = task.completed_at::text
    and not exists (
      select 1 from public.project_activity as simultaneous
      where simultaneous.entity_type = 'task' and simultaneous.entity_id = task.id
        and simultaneous.created_at = completion.entered_at and simultaneous.id <> completion.id
    )
    and exists (
      select 1 from public.project_activity as created
      where created.entity_type = 'task' and created.entity_id = task.id
        and created.action_type = 'task_created'
        and created.project_id = project.id and created.studio_id = project.studio_id
        and (created.created_at, created.id) < (completion.entered_at, completion.id)
    )
    and not exists (
      select 1 from public.project_activity as later_assignment
      where later_assignment.entity_type = 'task' and later_assignment.entity_id = task.id
        and later_assignment.action_type = 'task_updated'
        and later_assignment.changes ? 'assignee_id'
        and (later_assignment.created_at, later_assignment.id) > (completion.entered_at, completion.id)
    )
    and not exists (
      select 1 from public.project_activity as another_completion
      where another_completion.entity_type = 'task' and another_completion.entity_id = task.id
        and another_completion.action_type = 'task_updated'
        and another_completion.changes #>> '{status,to}' = 'completed'
        and another_completion.id <> completion.id
    )
    and not exists (
      select 1 from public.task_status_periods as previous_completion
      where previous_completion.task_id = task.id and previous_completion.status = 'completed'
        and previous_completion.id <> period.id
    )
    and not exists (
      select 1 from public.productivity_attributions as prior
      where prior.task_id = task.id and prior.source_type = 'task'
    )
)
insert into public.productivity_attributions (
  studio_id, project_id, task_id, contributor_id, source_type, task_stage,
  credited_area_m2, completed_at, contributor_name, contributor_job_title
)
select verified.studio_id, verified.project_id, verified.task_id, verified.assignee_id,
  'task', verified.stage, 0,
  verified.completed_at::timestamp at time zone 'Europe/Kyiv',
  verified.full_name, verified.job_title
from verified
on conflict (task_id) where source_type = 'task' and voided_at is null do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function private.backfill_audited_zero_area_task_attributions()
from public, anon, authenticated;

select private.backfill_audited_zero_area_task_attributions();
