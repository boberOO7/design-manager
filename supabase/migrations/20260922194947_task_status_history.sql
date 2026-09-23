create table public.task_status_periods (
  id bigint generated always as identity primary key,
  studio_id uuid not null references public.studios(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  status text not null check (status in ('todo', 'in_progress', 'internal_review', 'review', 'completed', 'cancelled')),
  entered_at timestamptz not null,
  exited_at timestamptz,
  check (exited_at is null or exited_at >= entered_at)
);

create unique index task_status_periods_open_task_idx
on public.task_status_periods (task_id)
where exited_at is null;
create index task_status_periods_task_entered_idx
on public.task_status_periods (task_id, entered_at desc);
create index task_status_periods_project_entered_idx
on public.task_status_periods (project_id, entered_at desc);
create index task_status_periods_studio_current_idx
on public.task_status_periods (studio_id, status, entered_at)
where exited_at is null;

alter table public.task_status_periods enable row level security;
revoke all on table public.task_status_periods from anon, authenticated;
grant select on table public.task_status_periods to authenticated;
create policy "task_status_periods_select_for_authorized_project_users"
on public.task_status_periods for select to authenticated
using ((select private.can_access_project(project_id)));

create or replace function private.record_task_status_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_studio_id uuid;
  transition_at timestamptz := clock_timestamp();
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select project.studio_id into task_studio_id
  from public.projects as project
  where project.id = new.project_id;
  if task_studio_id is null then raise exception 'Task project no longer exists'; end if;

  if tg_op = 'UPDATE' then
    update public.task_status_periods
    set exited_at = transition_at
    where task_id = new.id and exited_at is null;
  end if;

  insert into public.task_status_periods (
    studio_id, project_id, task_id, status, entered_at
  ) values (
    task_studio_id, new.project_id, new.id, new.status, transition_at
  );
  return new;
end;
$$;
revoke execute on function private.record_task_status_period()
from public, anon, authenticated;

create trigger record_task_status_period_after_insert
after insert on public.tasks
for each row execute function private.record_task_status_period();
create trigger record_task_status_period_after_status_change
after update of status on public.tasks
for each row execute function private.record_task_status_period();

-- Backfill only timestamped status events whose ordering and transition chain are
-- unambiguous. Older task timestamps are not status-transition evidence.
with status_events as (
  select
    activity.id as activity_id,
    activity.studio_id,
    activity.project_id,
    activity.entity_id as task_id,
    case
      when activity.action_type = 'task_created' then null
      else activity.changes #>> '{status,from}'
    end as from_status,
    case
      when activity.action_type = 'task_created' then activity.changes ->> 'status'
      else activity.changes #>> '{status,to}'
    end as to_status,
    activity.created_at as entered_at
  from public.project_activity as activity
  where activity.entity_type = 'task'
    and (
      (activity.action_type = 'task_created' and jsonb_typeof(activity.changes -> 'status') = 'string')
      or (activity.action_type = 'task_updated' and jsonb_typeof(activity.changes -> 'status') = 'object')
    )
), ordered_events as (
  select
    event.*,
    row_number() over status_order as event_number,
    count(*) over (partition by event.task_id) as event_count,
    lag(event.to_status) over status_order as previous_status,
    lag(event.entered_at) over status_order as previous_entered_at,
    lead(event.entered_at) over status_order as exited_at
  from status_events as event
  window status_order as (
    partition by event.task_id order by event.entered_at, event.activity_id
  )
), trustworthy_tasks as (
  select event.task_id
  from ordered_events as event
  inner join public.tasks as task on task.id = event.task_id
  inner join public.projects as project on project.id = task.project_id
  group by event.task_id, task.status
  having bool_and(event.studio_id = project.studio_id and event.project_id = task.project_id)
    and bool_and(event.to_status in ('todo', 'in_progress', 'internal_review', 'review', 'completed', 'cancelled'))
    and bool_and(event.event_number = 1 or event.from_status = event.previous_status)
    and count(*) filter (where event.entered_at = event.previous_entered_at) = 0
    and bool_or(event.event_number = event.event_count and event.to_status = task.status)
)
insert into public.task_status_periods (
  studio_id, project_id, task_id, status, entered_at, exited_at
)
select
  event.studio_id,
  event.project_id,
  event.task_id,
  event.to_status,
  event.entered_at,
  event.exited_at
from ordered_events as event
inner join trustworthy_tasks as trustworthy on trustworthy.task_id = event.task_id
order by event.task_id, event.entered_at, event.activity_id;
