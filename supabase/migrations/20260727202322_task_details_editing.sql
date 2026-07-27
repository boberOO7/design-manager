grant update (
  title,
  description,
  assignee_id,
  priority,
  due_date
) on table public.tasks to authenticated;

create or replace function private.is_active_project_task_assignee(
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
    from public.project_members as assignment
    inner join public.projects as project
      on project.id = assignment.project_id
    inner join public.studio_members as studio_member
      on studio_member.studio_id = project.studio_id
      and studio_member.user_id = assignment.user_id
    inner join public.profiles as assignee
      on assignee.id = assignment.user_id
    where assignment.project_id = target_project_id
      and assignment.user_id = target_assignee_id
      and assignment.is_active = true
      and studio_member.is_active = true
      and assignee.is_active = true
  );
$$;

revoke execute on function private.is_active_project_task_assignee(uuid, uuid)
from public, anon, authenticated;

create or replace function private.enforce_task_edit_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_studio_id uuid;
  is_admin boolean;
begin
  select project.studio_id
  into task_studio_id
  from public.projects as project
  where project.id = old.project_id
    and project.archived_at is null
    and project.status <> 'archived';

  if task_studio_id is null then
    raise exception 'Archived projects are read-only';
  end if;

  is_admin := coalesce(private.is_studio_admin(task_studio_id), false);

  if new.project_id is distinct from old.project_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.start_date is distinct from old.start_date then
    raise exception 'Task field is not editable';
  end if;

  if not is_admin and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.assignee_id is distinct from old.assignee_id
    or new.priority is distinct from old.priority
    or new.due_date is distinct from old.due_date
  ) then
    raise exception 'Only administrators may edit task details';
  end if;

  if is_admin
    and new.assignee_id is distinct from old.assignee_id
    and not private.is_active_project_task_assignee(old.project_id, new.assignee_id) then
    raise exception 'Task assignee must be an active project member';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_task_edit_permissions()
from public, anon, authenticated;

create trigger enforce_task_edit_permissions_before_update
before update on public.tasks
for each row
execute function private.enforce_task_edit_permissions();
