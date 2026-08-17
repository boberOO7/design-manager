-- The task column is already nullable. Keep the existing administrator and
-- active-project-member checks, but make an absent assignee a valid task state.
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
    where project.id = target_project_id
      and project.archived_at is null
      and project.status <> 'archived'
      and private.is_studio_admin(project.studio_id)
      and (
        target_assignee_id is null
        or exists (
          select 1
          from public.project_members as assignment
          inner join public.studio_members as studio_member
            on studio_member.studio_id = project.studio_id
            and studio_member.user_id = assignment.user_id
          inner join public.profiles as assignee
            on assignee.id = assignment.user_id
          where assignment.project_id = project.id
            and assignment.user_id = target_assignee_id
            and assignment.is_active = true
            and studio_member.is_active = true
            and assignee.is_active = true
        )
      )
  );
$$;

revoke execute on function private.can_create_project_task(uuid, uuid)
from public, anon;
grant execute on function private.can_create_project_task(uuid, uuid)
to authenticated;

create or replace function private.enforce_task_edit_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_status text; task_studio_id uuid; is_admin boolean;
begin
  select project.status, project.studio_id into project_status, task_studio_id
  from public.projects as project where project.id = old.project_id;
  if project_status is null or project_status = 'archived' then raise exception 'Archived projects are read-only'; end if;
  if project_status = 'completed' then raise exception 'Completed projects are read-only until reopened'; end if;
  is_admin := coalesce(private.is_studio_admin(task_studio_id), false);
  if new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at or new.start_date is distinct from old.start_date then raise exception 'Task field is not editable'; end if;
  if not is_admin and (new.title is distinct from old.title or new.description is distinct from old.description or new.assignee_id is distinct from old.assignee_id or new.priority is distinct from old.priority or new.due_date is distinct from old.due_date or new.completed_area_m2 is distinct from old.completed_area_m2 or new.progress_weight is distinct from old.progress_weight) then raise exception 'Only administrators may edit task details'; end if;
  if is_admin and new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id and not private.is_active_project_task_assignee(old.project_id, new.assignee_id) then raise exception 'Task assignee must be an active project member'; end if;
  return new;
end;
$$;

revoke execute on function private.enforce_task_edit_permissions()
from public, anon, authenticated;
