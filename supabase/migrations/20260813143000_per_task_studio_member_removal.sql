-- Open work may deliberately remain unassigned after an administrator removes
-- a studio member. Completed and cancelled task attribution stays immutable.
alter table public.tasks alter column assignee_id drop not null;

-- Application authorization already requires exactly one active studio for a
-- user. Make that identity invariant database-enforced as well: all RPCs that
-- derive a studio from auth.uid() can now do so unambiguously.
create unique index studio_members_one_active_studio_per_user
  on public.studio_members (user_id)
  where is_active;

-- This transaction-local permit is invisible to callers (all writes are
-- revoked) and lets only the removal RPC clear open-task assignees before it
-- deactivates the former project memberships. Rollbacks remove it with the
-- rest of the transaction.
create table private.studio_member_removal_unassignment_permits (
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (studio_id, user_id)
);

revoke all on table private.studio_member_removal_unassignment_permits from public, anon, authenticated;

-- Project membership cannot be withdrawn while it owns open tasks. This also
-- makes the replacement lock a durable invariant instead of a best-effort
-- convention in the studio-removal RPC.
create or replace function private.prevent_open_task_project_member_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.is_active and (tg_op = 'DELETE' or new.is_active = false) and exists (
    select 1 from public.tasks t
    where t.project_id = old.project_id and t.assignee_id = old.user_id
      and t.status not in ('completed', 'cancelled')
  ) then raise exception 'Open tasks must be reassigned or unassigned before removing a project member'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function private.prevent_open_task_project_member_removal() from public, anon, authenticated;

create trigger prevent_open_task_project_member_removal_before_write
before update of is_active or delete on public.project_members
for each row execute function private.prevent_open_task_project_member_removal();

-- Adding or reactivating a project member shares the same studio-member row
-- lock as task assignment. It cannot slip in after the removal RPC has swept
-- project memberships but before it deactivates the studio membership.
create or replace function private.lock_and_validate_project_member_studio_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active then
    perform 1 from public.projects p
      join public.studio_members sm on sm.studio_id = p.studio_id and sm.user_id = new.user_id
      join public.profiles pr on pr.id = new.user_id
      where p.id = new.project_id and sm.is_active and pr.is_active
      for share of sm, pr;
    if not found then raise exception 'Project members must be active studio members'; end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.lock_and_validate_project_member_studio_membership() from public, anon, authenticated;

create trigger enforce_project_member_studio_membership_before_write
before insert or update of project_id, user_id, is_active on public.project_members
for each row execute function private.lock_and_validate_project_member_studio_membership();

-- Every normal task assignment takes a shared row lock on the assignee's
-- project/studio membership. Studio-member removal takes an update lock on the
-- same row, so a task cannot pass validation while that member is being
-- deactivated (or vice versa). Project-member removal is serialized too.
create or replace function private.lock_and_validate_task_assignee(
  p_project_id uuid,
  p_assignee_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1
  from public.project_members pm
  join public.projects p on p.id = pm.project_id
  join public.studio_members sm on sm.studio_id = p.studio_id and sm.user_id = pm.user_id
  join public.profiles pr on pr.id = pm.user_id
  where pm.project_id = p_project_id and pm.user_id = p_assignee_id
    and pm.is_active and sm.is_active and pr.is_active
  for share of pm, sm, pr;
  if not found then raise exception 'Task assignee must be an active project member'; end if;
end;
$$;

revoke execute on function private.lock_and_validate_task_assignee(uuid, uuid) from public, anon, authenticated;

create or replace function private.enforce_task_assignee_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id or new.project_id is distinct from old.project_id) then
    perform private.lock_and_validate_task_assignee(new.project_id, new.assignee_id);
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_task_assignee_membership() from public, anon, authenticated;

create trigger enforce_task_assignee_membership_before_write
before insert or update of project_id, assignee_id on public.tasks
for each row execute function private.enforce_task_assignee_membership();

create or replace function public.get_studio_member_removal_impact(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid; v_open_count integer; v_overdue_count integer; v_project_count integer;
begin
  select sm.studio_id into v_studio_id from public.studio_members sm
  where sm.user_id = p_user_id and sm.is_active and private.is_studio_admin(sm.studio_id);
  if v_studio_id is null or p_user_id = (select auth.uid()) then raise exception 'Member cannot be removed from this studio'; end if;
  select count(*), count(*) filter (where t.due_date < current_date) into v_open_count, v_overdue_count
  from public.tasks t join public.projects p on p.id = t.project_id
  where p.studio_id = v_studio_id and t.assignee_id = p_user_id and t.status not in ('completed', 'cancelled');
  select count(distinct pm.project_id) into v_project_count from public.project_members pm join public.projects p on p.id = pm.project_id
  where p.studio_id = v_studio_id and pm.user_id = p_user_id and pm.is_active and p.status in ('planned','active','paused') and p.archived_at is null;
  return jsonb_build_object(
    'openTaskCount', v_open_count, 'overdueTaskCount', v_overdue_count, 'activeProjectCount', v_project_count,
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('projectId', grouped.project_id, 'projectName', grouped.project_name, 'tasks', grouped.tasks) order by grouped.project_name)
      from (
        select p.id as project_id, p.name as project_name, jsonb_agg(jsonb_build_object(
          'id', t.id, 'title', t.title, 'status', t.status, 'dueDate', t.due_date,
          'eligibleMembers', coalesce((select jsonb_agg(jsonb_build_object('id', sm.user_id, 'fullName', pr.full_name) order by pr.full_name)
            from public.project_members pm join public.studio_members sm on sm.studio_id = v_studio_id and sm.user_id = pm.user_id
            join public.profiles pr on pr.id = sm.user_id
            where pm.project_id = t.project_id and pm.is_active and sm.is_active and pr.is_active and sm.user_id <> p_user_id), '[]'::jsonb)
        ) order by t.due_date nulls last, t.created_at) as tasks
        from public.tasks t join public.projects p on p.id = t.project_id
        where p.studio_id = v_studio_id and t.assignee_id = p_user_id and t.status not in ('completed', 'cancelled')
        group by p.id, p.name
      ) grouped
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.remove_studio_member(
  p_user_id uuid,
  p_reassignments jsonb,
  p_allow_unassigned boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid; v_target_role text; v_open_count integer; v_decision_count integer;
begin
  select sm.studio_id into v_studio_id from public.studio_members sm
  where sm.user_id = (select auth.uid()) and sm.is_active and sm.system_role = 'admin';
  select sm.system_role into v_target_role from public.studio_members sm
  where sm.studio_id = v_studio_id and sm.user_id = p_user_id and sm.is_active for update;
  if v_studio_id is null or v_target_role is null then raise exception 'Active studio member was not found'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'You cannot remove yourself'; end if;
  perform 1 from public.studio_members sm where sm.studio_id = v_studio_id and sm.is_active and sm.system_role = 'admin' for update;
  if v_target_role = 'admin' and (select count(*) from public.studio_members where studio_id = v_studio_id and is_active and system_role = 'admin') <= 1 then raise exception 'The last active administrator cannot be removed'; end if;
  if jsonb_typeof(p_reassignments) <> 'array' then raise exception 'Invalid reassignment instructions'; end if;
  if exists (select 1 from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid) where r.task_id is null or r.assignee_id is null) then raise exception 'Invalid reassignment instructions'; end if;
  if (select count(*) from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)) <> (select count(distinct r.task_id) from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)) then raise exception 'A task may only have one reassignment'; end if;
  select count(*) into v_open_count from public.tasks t join public.projects p on p.id = t.project_id
  where p.studio_id = v_studio_id and t.assignee_id = p_user_id and t.status not in ('completed', 'cancelled');
  select count(*) into v_decision_count from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid);
  if v_decision_count > v_open_count or exists (
    select 1 from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)
    left join public.tasks t on t.id = r.task_id and t.assignee_id = p_user_id and t.status not in ('completed', 'cancelled')
    left join public.projects p on p.id = t.project_id and p.studio_id = v_studio_id
    where t.id is null or p.id is null
  ) then raise exception 'Reassignment instructions do not match this member’s open tasks'; end if;
  if not p_allow_unassigned and v_decision_count <> v_open_count then raise exception 'Every open task requires an eligible reassignment'; end if;
  -- Hold the replacement memberships through the task updates. A concurrent
  -- studio or project-member removal must wait rather than leaving an open task
  -- pointing at a deactivated replacement.
  perform 1 from public.project_members pm
    join public.projects p on p.id = pm.project_id
    join public.studio_members sm on sm.studio_id = v_studio_id and sm.user_id = pm.user_id
    join public.profiles pr on pr.id = pm.user_id
    join jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)
      on r.task_id in (select t.id from public.tasks t where t.project_id = pm.project_id)
      and r.assignee_id = pm.user_id
    where p.studio_id = v_studio_id and pm.is_active and sm.is_active and pr.is_active
    for share of pm, sm, pr;
  if exists (
    select 1 from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)
    join public.tasks t on t.id = r.task_id
    where r.assignee_id = p_user_id or not exists (
      select 1 from public.project_members pm join public.studio_members sm on sm.studio_id = v_studio_id and sm.user_id = pm.user_id join public.profiles pr on pr.id = sm.user_id
      where pm.project_id = t.project_id and pm.user_id = r.assignee_id and pm.is_active and sm.is_active and pr.is_active
    )
  ) then raise exception 'A replacement must be an active member of that task’s project'; end if;
  update public.tasks t set assignee_id = r.assignee_id from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)
  where t.id = r.task_id and t.assignee_id = p_user_id and t.status not in ('completed', 'cancelled');
  if p_allow_unassigned then
    insert into private.studio_member_removal_unassignment_permits (studio_id, user_id) values (v_studio_id, p_user_id);
    update public.tasks t set assignee_id = null from public.projects p
    where p.id = t.project_id and p.studio_id = v_studio_id and t.assignee_id = p_user_id and t.status not in ('completed', 'cancelled');
    delete from private.studio_member_removal_unassignment_permits where studio_id = v_studio_id and user_id = p_user_id;
  end if;
  update public.project_members pm set is_active = false, removed_at = current_date from public.projects p
  where p.id = pm.project_id and p.studio_id = v_studio_id and pm.user_id = p_user_id and pm.is_active;
  update public.studio_members set is_active = false, removed_at = now(), removed_by = (select auth.uid())
  where studio_id = v_studio_id and user_id = p_user_id and is_active;
end;
$$;

-- Keep the deployed signature as a forwarding overload during rolling deploys.
-- Existing servers retain their old all-to-one semantics while new servers use
-- the per-task signature above; it can be removed only after that rollout.
create or replace function public.remove_studio_member(p_user_id uuid, p_reassignment_user_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_reassignments jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('task_id', t.id, 'assignee_id', p_reassignment_user_id)), '[]'::jsonb)
    into v_reassignments
  from public.tasks t
  join public.projects p on p.id = t.project_id
  join public.studio_members actor on actor.studio_id = p.studio_id
  where actor.user_id = (select auth.uid()) and actor.is_active and actor.system_role = 'admin'
    and t.assignee_id = p_user_id and t.status not in ('completed', 'cancelled');
  perform public.remove_studio_member(p_user_id, v_reassignments, false);
end;
$$;

revoke all on function public.remove_studio_member(uuid, jsonb, boolean) from public, anon;
grant execute on function public.remove_studio_member(uuid, jsonb, boolean) to authenticated;
revoke all on function public.remove_studio_member(uuid, uuid) from public, anon;
grant execute on function public.remove_studio_member(uuid, uuid) to authenticated;
revoke all on function public.get_studio_member_removal_impact(uuid) from public, anon;
grant execute on function public.get_studio_member_removal_impact(uuid) to authenticated;

-- Preserve the existing task-edit guard. Null is accepted only while the
-- removal RPC's non-public transaction permit is present.
create or replace function private.enforce_task_edit_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_status text; task_studio_id uuid; is_admin boolean;
begin
  select project.status, project.studio_id into project_status, task_studio_id from public.projects as project where project.id = old.project_id;
  if project_status is null or project_status = 'archived' then raise exception 'Archived projects are read-only'; end if;
  if project_status = 'completed' then raise exception 'Completed projects are read-only until reopened'; end if;
  is_admin := coalesce(private.is_studio_admin(task_studio_id), false);
  if new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at or new.start_date is distinct from old.start_date then raise exception 'Task field is not editable'; end if;
  if not is_admin and (new.title is distinct from old.title or new.description is distinct from old.description or new.assignee_id is distinct from old.assignee_id or new.priority is distinct from old.priority or new.due_date is distinct from old.due_date or new.completed_area_m2 is distinct from old.completed_area_m2 or new.progress_weight is distinct from old.progress_weight) then raise exception 'Only administrators may edit task details'; end if;
  if is_admin and new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id and not private.is_active_project_task_assignee(old.project_id, new.assignee_id) then raise exception 'Task assignee must be an active project member'; end if;
  if is_admin and new.assignee_id is null and new.assignee_id is distinct from old.assignee_id and exists (
    select 1 from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.project_id = old.project_id and pm.user_id = old.assignee_id and pm.is_active
      and not exists (select 1 from private.studio_member_removal_unassignment_permits permit where permit.studio_id = p.studio_id and permit.user_id = old.assignee_id)
  ) then raise exception 'Active project tasks cannot be manually unassigned'; end if;
  return new;
end;
$$;
