drop view public.finance_payroll_editability;

create function public.get_finance_payroll_editability(p_studio_id uuid)
returns table(schedule_id uuid, editable boolean, removable boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_finance_admin(p_studio_id) then
    raise exception 'finance_admin_required';
  end if;

  return query
  select s.id,
    not private.finance_payroll_term_consumed(s.studio_id, t.id),
    not private.finance_payroll_schedule_consumed(s.studio_id, s.id)
  from public.finance_schedules s
  join lateral (
    select st.id
    from public.finance_schedule_terms st
    where st.studio_id = s.studio_id and st.schedule_id = s.id
    order by st.revision desc
    limit 1
  ) t on true
  where s.studio_id = p_studio_id and s.kind = 'payroll' and s.stopped_from is null;
end;
$$;

revoke all on function public.get_finance_payroll_editability(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_finance_payroll_editability(uuid) to authenticated;
