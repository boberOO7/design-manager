-- Project removal uses the studio-removal reassignment contract, but only
-- changes one active project_members row. Closed work is intentionally absent.
create or replace function public.get_project_member_removal_impact(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid; v_studio_id uuid; v_user_id uuid; v_project_name text; v_open_count integer; v_overdue_count integer;
begin
  select pm.project_id, p.studio_id, pm.user_id, p.name into v_project_id, v_studio_id, v_user_id, v_project_name
  from public.project_members pm join public.projects p on p.id = pm.project_id
  where pm.id = p_assignment_id and pm.is_active;
  if v_project_id is null or not coalesce(private.is_studio_admin(v_studio_id), false) then raise exception 'Active project member was not found'; end if;
  select count(*), count(*) filter (where t.due_date < current_date) into v_open_count, v_overdue_count
  from public.tasks t where t.project_id = v_project_id and t.assignee_id = v_user_id and t.status not in ('completed', 'cancelled');
  return jsonb_build_object(
    'openTaskCount', v_open_count, 'overdueTaskCount', v_overdue_count, 'activeProjectCount', 1,
    'projects', jsonb_build_array(jsonb_build_object('projectId', v_project_id, 'projectName', v_project_name, 'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'dueDate', t.due_date,
        'eligibleMembers', coalesce((select jsonb_agg(jsonb_build_object('id', pm.user_id, 'fullName', pr.full_name) order by pr.full_name)
          from public.project_members pm join public.studio_members sm on sm.studio_id = v_studio_id and sm.user_id = pm.user_id
          join public.profiles pr on pr.id = pm.user_id
          where pm.project_id = v_project_id and pm.is_active and sm.is_active and pr.is_active and pm.user_id <> v_user_id), '[]'::jsonb)
      ) order by t.due_date nulls last, t.created_at)
      from public.tasks t where t.project_id = v_project_id and t.assignee_id = v_user_id and t.status not in ('completed', 'cancelled')
    ), '[]'::jsonb)))
  );
end;
$$;

create or replace function public.remove_project_member(p_assignment_id uuid, p_reassignments jsonb, p_allow_unassigned boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid; v_studio_id uuid; v_user_id uuid; v_open_count integer; v_decision_count integer;
begin
  select pm.project_id, p.studio_id, pm.user_id into v_project_id, v_studio_id, v_user_id
  from public.project_members pm join public.projects p on p.id = pm.project_id
  where pm.id = p_assignment_id and pm.is_active for update of pm;
  if v_project_id is null or not coalesce(private.is_studio_admin(v_studio_id), false) then raise exception 'Active project member was not found'; end if;
  -- Serialize all removal paths for this person so the shared, transaction-local
  -- unassignment permit cannot overlap with another project or studio removal.
  perform 1 from public.studio_members sm where sm.studio_id = v_studio_id and sm.user_id = v_user_id and sm.is_active for update;
  if not found then raise exception 'Active studio member was not found'; end if;
  if p_reassignments is null or jsonb_typeof(p_reassignments) <> 'array' then raise exception 'Invalid reassignment instructions'; end if;
  if p_allow_unassigned is null then raise exception 'Allow-unassigned must be explicitly chosen'; end if;
  if exists (select 1 from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid) where r.task_id is null or r.assignee_id is null) then raise exception 'Invalid reassignment instructions'; end if;
  if (select count(*) from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)) <> (select count(distinct r.task_id) from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)) then raise exception 'A task may only have one reassignment'; end if;
  select count(*) into v_open_count from public.tasks t where t.project_id = v_project_id and t.assignee_id = v_user_id and t.status not in ('completed', 'cancelled');
  select count(*) into v_decision_count from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid);
  if v_decision_count > v_open_count or exists (
    select 1 from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)
    left join public.tasks t on t.id = r.task_id and t.project_id = v_project_id and t.assignee_id = v_user_id and t.status not in ('completed', 'cancelled')
    where t.id is null
  ) then raise exception 'Reassignment instructions do not match this member’s open tasks'; end if;
  if not p_allow_unassigned and v_decision_count <> v_open_count then raise exception 'Every open task requires an eligible reassignment'; end if;
  perform 1 from public.project_members pm join public.studio_members sm on sm.studio_id = v_studio_id and sm.user_id = pm.user_id
    join public.profiles pr on pr.id = pm.user_id join jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid) on r.assignee_id = pm.user_id
    where pm.project_id = v_project_id and pm.is_active and sm.is_active and pr.is_active for share of pm, sm, pr;
  if exists (
    select 1 from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)
    where r.assignee_id = v_user_id or not exists (
      select 1 from public.project_members pm join public.studio_members sm on sm.studio_id = v_studio_id and sm.user_id = pm.user_id join public.profiles pr on pr.id = pm.user_id
      where pm.project_id = v_project_id and pm.user_id = r.assignee_id and pm.is_active and sm.is_active and pr.is_active
    )
  ) then raise exception 'A replacement must be an active member of that task’s project'; end if;
  update public.tasks t set assignee_id = r.assignee_id from jsonb_to_recordset(p_reassignments) as r(task_id uuid, assignee_id uuid)
  where t.id = r.task_id and t.project_id = v_project_id and t.assignee_id = v_user_id and t.status not in ('completed', 'cancelled');
  if p_allow_unassigned then
    insert into private.studio_member_removal_unassignment_permits (studio_id, user_id) values (v_studio_id, v_user_id);
    update public.tasks t set assignee_id = null where t.project_id = v_project_id and t.assignee_id = v_user_id and t.status not in ('completed', 'cancelled');
    delete from private.studio_member_removal_unassignment_permits where studio_id = v_studio_id and user_id = v_user_id;
  end if;
  update public.project_members set is_active = false, removed_at = current_date where id = p_assignment_id and project_id = v_project_id and user_id = v_user_id and is_active;
end;
$$;

revoke all on function public.get_project_member_removal_impact(uuid) from public, anon;
grant execute on function public.get_project_member_removal_impact(uuid) to authenticated;
revoke all on function public.remove_project_member(uuid, jsonb, boolean) from public, anon;
grant execute on function public.remove_project_member(uuid, jsonb, boolean) to authenticated;
