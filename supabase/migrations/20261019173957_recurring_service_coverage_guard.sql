-- A changed billing cadence may start before the preceding service coverage ends.
create function private.guard_finance_service_coverage() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.policy='manual' then return new;end if;
  if exists(
    select 1 from public.finance_obligations o
    join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id and i.component='recurring'
    cross join lateral private.finance_expense_policy_for_item(o.studio_id,i.expected_item_id) p
    where o.studio_id=new.studio_id and o.schedule_id=new.schedule_id and o.period_start<new.first_period
      and p.id is not null and p.policy<>'manual'
      and (p.service_start+make_interval(months=>
        (extract(year from o.period_start)-extract(year from p.first_period))::integer*12
        +(extract(month from o.period_start)-extract(month from p.first_period))::integer+p.service_months))::date
        >greatest(new.service_start,new.effective_from)
  ) then raise exception 'finance_expense_history_protected';end if;
  return new;
end $$;
revoke all on function private.guard_finance_service_coverage() from public,anon,authenticated,service_role;
create trigger finance_service_coverage_guard before insert on public.finance_expense_service_policies
  for each row execute function private.guard_finance_service_coverage();
