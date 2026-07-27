revoke insert, update
on table public.tasks
from anon, authenticated;

grant insert (
  project_id,
  title,
  description,
  priority,
  assignee_id,
  created_by,
  due_date
) on table public.tasks to authenticated;

grant update (status)
on table public.tasks
to authenticated;

create or replace function private.can_create_project_task(
  target_project_id uuid,
  target_assignee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    inner join public.project_members as assignment
      on assignment.project_id = project.id
    inner join public.studio_members as studio_member
      on studio_member.studio_id = project.studio_id
      and studio_member.user_id = assignment.user_id
    inner join public.profiles as assignee
      on assignee.id = assignment.user_id
    where project.id = target_project_id
      and project.archived_at is null
      and project.status <> 'archived'
      and assignment.user_id = target_assignee_id
      and assignment.is_active = true
      and studio_member.is_active = true
      and assignee.is_active = true
      and private.is_studio_admin(project.studio_id)
  );
$$;

revoke execute on function private.can_create_project_task(uuid, uuid)
from public, anon;
grant execute on function private.can_create_project_task(uuid, uuid)
to authenticated;

create or replace function private.can_update_project_task_status(
  target_project_id uuid,
  target_assignee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    where project.id = target_project_id
      and project.archived_at is null
      and project.status <> 'archived'
      and private.is_studio_admin(project.studio_id)
  )
  or (
    target_assignee_id = (select auth.uid())
    and exists (
      select 1
      from public.project_members as assignment
      inner join public.projects as project
        on project.id = assignment.project_id
      inner join public.studio_members as studio_member
        on studio_member.studio_id = project.studio_id
        and studio_member.user_id = assignment.user_id
      inner join public.profiles as assignee
        on assignee.id = assignment.user_id
      where assignment.project_id = target_project_id
        and project.archived_at is null
        and project.status <> 'archived'
        and assignment.user_id = target_assignee_id
        and assignment.is_active = true
        and studio_member.is_active = true
        and assignee.is_active = true
    )
  );
$$;

revoke execute on function private.can_update_project_task_status(uuid, uuid)
from public, anon;
grant execute on function private.can_update_project_task_status(uuid, uuid)
to authenticated;

create policy "tasks_insert_for_studio_admins"
on public.tasks
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'todo'
  and completed_at is null
  and (select private.can_create_project_task(project_id, assignee_id))
);

create policy "tasks_update_status_for_admins_and_assignees"
on public.tasks
for update
to authenticated
using (
  (select private.can_update_project_task_status(project_id, assignee_id))
)
with check (
  (select private.can_update_project_task_status(project_id, assignee_id))
  and status in ('todo', 'in_progress', 'completed')
);

create or replace function private.sync_task_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at = current_date;
  elsif new.status is distinct from 'completed' then
    new.completed_at = null;
  end if;

  return new;
end;
$$;

revoke execute on function private.sync_task_completed_at()
from public, anon, authenticated;

create trigger sync_task_completed_at_on_status_change
before update of status on public.tasks
for each row
execute function private.sync_task_completed_at();
