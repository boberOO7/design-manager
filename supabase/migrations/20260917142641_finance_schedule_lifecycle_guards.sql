-- Rehiring cannot introduce another salary for an already-created service month.
create function private.guard_finance_payroll_terms() returns trigger
language plpgsql security definer set search_path='' as $$
declare schedule public.finance_schedules;
begin
  select * into schedule from public.finance_schedules where studio_id=new.studio_id and id=new.schedule_id;
  if schedule.kind='payroll' and exists(select 1 from public.finance_obligations
    where studio_id=new.studio_id and employee_id=schedule.employee_id and kind='payroll'
      and schedule_id<>new.schedule_id and period_end>=new.effective_from) then raise exception 'finance_schedule_effective_date'; end if;
  return new;
end $$;
create trigger finance_payroll_terms_guard before insert on public.finance_schedule_terms for each row execute function private.guard_finance_payroll_terms();

-- A profile deactivation has the same durable stop boundary as membership removal.
create function private.stop_inactive_profile_payroll() returns trigger
language plpgsql security definer set search_path='' as $$
declare membership record;
begin
  if old.is_active and not new.is_active then
    for membership in select studio_id from public.studio_members where user_id=new.id order by studio_id for update loop
      perform 1 from public.finance_settings where studio_id=membership.studio_id for update;
      update public.finance_schedules set stopped_from=least(stopped_from,(date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '1 month')::date)
        where studio_id=membership.studio_id and employee_id=new.id;
    end loop;
  end if;
  return new;
end $$;
create trigger finance_stop_inactive_profile after update of is_active on public.profiles for each row execute function private.stop_inactive_profile_payroll();
revoke all on function private.guard_finance_payroll_terms(),private.stop_inactive_profile_payroll() from public,anon,authenticated,service_role;
