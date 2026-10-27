-- Imported/pre-rollout memberships can have dated employment but no Finance
-- snapshot. Reuse those explicit dates as the original rollout baseline did.
-- Never replace an existing transition history, or infer an unknown join date.
create or replace function private.finance_labor_employed_on_day(p_studio uuid,p_employee uuid,p_day date) returns boolean
language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from private.finance_labor_membership_events
    where studio_id=p_studio and employee_id=p_employee) then
    coalesce((select e.joined_on<=p_day and
      case when e.baseline then e.removed_on is null or p_day<e.removed_on else e.is_active end
      from private.finance_labor_membership_events e where e.studio_id=p_studio and e.employee_id=p_employee
        and (e.baseline or (e.changed_at at time zone 'Europe/Kyiv')::date<=p_day)
      order by e.baseline asc,e.changed_at desc,e.id desc limit 1),false)
  else
    coalesce((select m.joined_at<=p_day and
      case when m.removed_at is not null then p_day<(m.removed_at at time zone 'Europe/Kyiv')::date else m.is_active end
      from public.studio_members m where m.studio_id=p_studio and m.user_id=p_employee),false)
  end
$$;
revoke all on function private.finance_labor_employed_on_day(uuid,uuid,date) from public,anon,authenticated,service_role;
