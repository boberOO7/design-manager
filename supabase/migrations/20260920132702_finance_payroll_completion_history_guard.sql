create or replace function private.guard_finance_payroll_terms() returns trigger
language plpgsql security definer set search_path='' as $$
declare schedule public.finance_schedules;
begin
  select * into schedule from public.finance_schedules where studio_id=new.studio_id and id=new.schedule_id;
  if schedule.kind='payroll' and exists(
    select 1 from public.finance_obligations o
    where o.studio_id=new.studio_id and o.employee_id=schedule.employee_id and o.kind='payroll'
      and o.schedule_id<>new.schedule_id and o.period_end>=new.effective_from
      and exists(select 1 from public.finance_obligation_items l where l.studio_id=o.studio_id and l.obligation_id=o.id and l.managed_active)
  ) then raise exception 'finance_schedule_effective_date'; end if;
  -- Completion facts protect an occurrence even if its payout is later marked
  -- unearned. Do not accept amendments that maintenance must refuse to apply.
  if schedule.kind='payroll' and exists(
    select 1 from public.finance_obligations o
    join public.finance_payroll_cost_revisions r on r.studio_id=o.studio_id and r.obligation_id=o.id
    where o.studio_id=new.studio_id and o.schedule_id=new.schedule_id and o.period_end>=new.effective_from
  ) then raise exception 'finance_schedule_effective_date'; end if;
  return new;
end $$;

