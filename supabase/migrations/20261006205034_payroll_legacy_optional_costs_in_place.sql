-- One-time, studio-authorized correction of existing blank optional payroll
-- components. Do not create compensation amendments or move payout periods.
-- Only the terms' two optional values and corresponding status may change.
do $$
declare
  previous_lock_timeout text := current_setting('lock_timeout');
  corrected integer;
begin
  perform set_config('lock_timeout','5s',true);
  -- The exclusive lock prevents any concurrent writer from observing the
  -- temporarily suspended history guard. DDL is transactional with the update.
  lock table public.finance_schedule_terms in access exclusive mode;
  -- Explicit per-period unknown facts outrank term defaults. Leave their terms
  -- untouched so the existing completion workflow remains available.
  if exists (
    select 1 from public.finance_schedule_terms t
    join public.finance_schedules s on s.studio_id=t.studio_id and s.id=t.schedule_id
    join public.finance_obligations o on o.studio_id=t.studio_id and o.terms_id=t.id
    cross join lateral (values
      ('deductions',t.employee_deductions is null),
      ('employer_cost',t.employer_cost is null)
    ) c(component,is_blank)
    join lateral (
      select r.status from public.finance_payroll_cost_revisions r
      where r.studio_id=o.studio_id and r.obligation_id=o.id and r.component=c.component
      order by r.revision desc limit 1
    ) r on true
    where s.kind='payroll' and t.basis in ('net','gross')
      and t.employee_payout is not null and c.is_blank and r.status='unknown'
  ) then
    raise exception 'finance_payroll_explicit_unknown_requires_completion';
  end if;
  if not exists(select 1 from pg_trigger
    where tgrelid='public.finance_schedule_terms'::regclass
      and tgname='finance_payroll_term_edit_guard' and tgenabled='O') then
    raise exception 'finance_payroll_history_guard_required';
  end if;

  alter table public.finance_schedule_terms disable trigger finance_payroll_term_edit_guard;
  update public.finance_schedule_terms t
    set employee_deductions=coalesce(t.employee_deductions,0),
        employer_cost=coalesce(t.employer_cost,0),
        employer_cost_status=case when t.employer_cost is null then 'fixed' else t.employer_cost_status end
    from public.finance_schedules s
    where s.studio_id=t.studio_id and s.id=t.schedule_id and s.kind='payroll'
      and t.basis in ('net','gross') and t.employee_payout is not null
      and (t.employee_deductions is null or t.employer_cost is null);
  get diagnostics corrected = row_count;
  alter table public.finance_schedule_terms enable trigger finance_payroll_term_edit_guard;

  perform set_config('lock_timeout',previous_lock_timeout,true);
  raise notice 'Completed blank optional components in % existing payroll terms.',corrected;
end $$;
