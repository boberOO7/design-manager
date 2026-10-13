-- Keep the canonical permission predicate, but evaluate it once per project
-- per statement instead of once per task/checklist/deadline/status-period row.
create function private.accessible_project_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select project.id from public.projects as project
  where private.can_access_project(project.id);
$$;
revoke all on function private.accessible_project_ids() from public, anon;
grant execute on function private.accessible_project_ids() to authenticated;

alter policy projects_select_for_authorized_users on public.projects
  using (id in (select private.accessible_project_ids()));
-- can_access_project already includes this administrator grant.
drop policy projects_select_for_studio_admins on public.projects;
alter policy project_members_select_for_authorized_users on public.project_members
  using (project_id in (select private.accessible_project_ids()));
alter policy tasks_select_for_authorized_users on public.tasks
  using (project_id in (select private.accessible_project_ids()));
alter policy task_schedules_read on public.task_schedules
  using (project_id in (select private.accessible_project_ids()));
alter policy task_status_periods_select_for_authorized_project_users on public.task_status_periods
  using (project_id in (select private.accessible_project_ids()));
alter policy project_task_stage_columns_select on public.project_task_stage_columns
  using (project_id in (select private.accessible_project_ids()));

-- The task lookup already enforces the same project permission through RLS.
alter policy task_checklist_items_select_for_authorized_users on public.task_checklist_items
  using (exists (select 1 from public.tasks as task where task.id = task_checklist_items.task_id));
alter policy task_deadlines_select_for_authorized_users on public.task_deadlines
  using (exists (select 1 from public.tasks as task where task.id = task_deadlines.task_id));
alter policy task_collaborators_select_for_authorized_users on public.task_collaborators
  using (exists (select 1 from public.tasks as task where task.id = task_collaborators.task_id));

-- These ALL policies redundantly reauthorize SELECT rows. Preserve their exact
-- write predicates and grants while limiting them to the three write commands.
do $$
declare
  relation_name text;
  original_policy text;
  read_predicate text;
  write_predicate text;
begin
  foreach relation_name in array array['task_deadlines', 'task_collaborators'] loop
    original_policy := relation_name || '_write_for_studio_admins';
    select qual, with_check into strict read_predicate, write_predicate
    from pg_policies where schemaname = 'public'
      and tablename = relation_name and policyname = original_policy and cmd = 'ALL';
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
      relation_name || '_insert_for_studio_admins', relation_name, write_predicate);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      relation_name || '_update_for_studio_admins', relation_name, read_predicate, write_predicate);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
      relation_name || '_delete_for_studio_admins', relation_name, read_predicate);
    execute format('drop policy %I on public.%I', original_policy, relation_name);
  end loop;
end;
$$;
