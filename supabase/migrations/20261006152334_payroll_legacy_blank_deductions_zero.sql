-- One-time conversion of all existing blank optional payroll components to
-- known zero, as requested by the studio. Future intentional unknown choices
-- remain available. Preserve consumed terms and stored recognition snapshots;
-- complete their missing components with append-only zero facts.
do $$
declare
  studio record;
  schedule public.finance_schedules;
  terms public.finance_schedule_terms;
  missing record;
  starts date;
  horizon date;
  first_month date := date_trunc('month', now() at time zone 'Europe/Kyiv')::date;
  previous_edit text := current_setting('studioflow.finance_payroll_draft_edit', true);
begin
  for studio in select studio_id from public.finance_settings order by studio_id for update loop
    for schedule in select * from public.finance_schedules
      where studio_id=studio.studio_id and kind='payroll' and stopped_from is null
      order by id for update loop
      select * into terms from public.finance_schedule_terms
        where studio_id=schedule.studio_id and schedule_id=schedule.id order by revision desc limit 1;
      if terms.id is null or (terms.employee_deductions is not null and terms.employer_cost is not null) then continue; end if;

      if not private.finance_payroll_term_consumed(schedule.studio_id, terms.id) then
        perform set_config('studioflow.finance_payroll_draft_edit', 'on', true);
        update public.finance_schedule_terms set employee_deductions=coalesce(employee_deductions,0),
          employer_cost=coalesce(employer_cost,0),
          employer_cost_status=case when employer_cost is null then 'fixed' else employer_cost_status end
          where studio_id=schedule.studio_id and id=terms.id;
        perform set_config('studioflow.finance_payroll_draft_edit', coalesce(previous_edit,''), true);
      else
        -- Use the existing revision boundary: after every protected occurrence
        -- and the current service month. Historic agreements remain untouched.
        select greatest((first_month+interval '1 month')::date,
          (terms.effective_from+interval '1 month')::date,
          coalesce((max(o.period_start)+interval '1 month')::date, first_month)) into starts
        from public.finance_obligations o
        where o.studio_id=schedule.studio_id and o.employee_id=schedule.employee_id and o.kind='payroll'
          and (exists(select 1 from public.finance_recognition_entries r where r.studio_id=o.studio_id and r.obligation_id=o.id)
            or exists(select 1 from public.finance_payroll_cost_revisions r where r.studio_id=o.studio_id and r.obligation_id=o.id)
            or exists(select 1 from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
              where l.studio_id=o.studio_id and l.obligation_id=o.id and (i.is_established
                or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id))));
        if terms.effective_through is not null and terms.effective_through<starts then continue; end if;
        insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,
          interval_months,payout_day,payment_month_offset,effective_from,effective_through,commitment,certainty,basis,
          employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
        values(terms.studio_id,terms.schedule_id,terms.revision+1,terms.name,terms.amount,terms.currency,terms.category_id,
          terms.interval_months,terms.payout_day,terms.payment_month_offset,starts,terms.effective_through,
          terms.commitment,terms.certainty,terms.basis,terms.employee_payout,coalesce(terms.employee_deductions,0),coalesce(terms.employer_cost,0),
          case when terms.employer_cost is null then 'fixed' else terms.employer_cost_status end,
          'Незазначені додаткові складові зарплати: 0.',terms.created_by);
        select greatest((first_month+interval '11 months')::date,coalesce(max(period_start),first_month)) into horizon
          from public.finance_obligations where studio_id=schedule.studio_id and schedule_id=schedule.id;
        if starts<=horizon then
          perform private.reconcile_finance_schedule_occurrences(schedule.studio_id,schedule.id,starts,horizon,terms.created_by);
        end if;
      end if;
    end loop;
    -- A zero completion changes no salary, cash, or recognized amount. Keep the
    -- original unknown facts and snapshots and append the new known-zero fact.
    for missing in
      select o.id as obligation_id,c.component,coalesce(r.revision,0)+1 as revision,t.created_by
      from public.finance_obligations o
      join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
      cross join lateral (values ('deductions',t.employee_deductions is null),('employer_cost',t.employer_cost is null)) c(component,is_missing)
      left join lateral (select * from public.finance_payroll_cost_revisions r
        where r.studio_id=o.studio_id and r.obligation_id=o.id and r.component=c.component order by revision desc limit 1) r on true
      where o.studio_id=studio.studio_id and o.kind='payroll' and c.is_missing and coalesce(r.status,'unknown')='unknown'
        and not exists(select 1 from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
          where l.studio_id=o.studio_id and l.obligation_id=o.id and l.component=c.component
            and (i.is_established or (i.commitment<>'cancelled' and i.amount>0)
              or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id)))
      order by o.id,c.component
    loop
      insert into public.finance_payroll_cost_revisions(studio_id,obligation_id,component,revision,status,amount,reason,created_by)
        values(studio.studio_id,missing.obligation_id,missing.component,missing.revision,'fixed',0,
          'Незазначені додаткові складові зарплати: 0.',missing.created_by);
    end loop;
  end loop;
end $$;
