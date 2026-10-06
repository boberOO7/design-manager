begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('6c000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.month() returns date language sql stable as $$select date_trunc('month',now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.payroll(employee integer,patch jsonb default '{}') returns jsonb language sql as $$
select jsonb_build_object('kind','payroll','employeeId',pg_temp.fid(employee),'revision',0,'name','Salary',
  'amount','1000','currency','UAH','categoryId',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),
  'basis','net','employeePayout','1000','intervalMonths',1,'payoutDay',1,'paymentMonthOffset',1,
  'effectiveFrom',pg_temp.month(),'commitment','agreed','certainty','fixed','reason','Optional costs test')||patch$$;
create function pg_temp.terms(employee integer) returns jsonb language sql stable as $$
select to_jsonb(t) from public.finance_schedule_terms t join public.finance_schedules s on s.studio_id=t.studio_id and s.id=t.schedule_id
where s.studio_id=pg_temp.fid(1) and s.employee_id=pg_temp.fid(employee) order by revision desc limit 1$$;
create function pg_temp.source(employee integer) returns jsonb language sql stable as $$
select s from jsonb_array_elements(public.get_finance_labor_sources(pg_temp.fid(1))) s where s->>'employeeId'=pg_temp.fid(employee)::text limit 1$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Payroll optional costs');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','optional-payroll-'||n||'@test','{}','{}',now(),now() from generate_series(10,15)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Optional payroll '||n,'optional-payroll-'||n||'@test',case when n=10 then 'admin' else 'employee' end,true from generate_series(10,15)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(1),pg_temp.fid(n),case when n=10 then 'admin' else 'employee' end,true from generate_series(10,15)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values(pg_temp.fid(1),'UAH',pg_temp.month(),pg_temp.fid(10));
insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values(pg_temp.fid(1),'Cash','UAH',0,pg_temp.fid(10));
-- Legacy nulls are deliberately preserved, independent of the new save defaults.
insert into public.finance_schedules(id,studio_id,kind,employee_id,created_by) values(pg_temp.fid(100),pg_temp.fid(1),'payroll',pg_temp.fid(15),pg_temp.fid(10));
insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,effective_from,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
values(pg_temp.fid(1),pg_temp.fid(100),1,'Legacy',1000,'UAH',(select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key='salary'),1,1,pg_temp.month(),'agreed','fixed','net',1000,null,null,'unknown','Legacy terms',pg_temp.fid(10));
create temp table legacy_snapshot as select pg_temp.terms(15) as value;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
select public.finalize_finance_setup(pg_temp.fid(1));
select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(50),pg_temp.month());
select lives_ok($$select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(51),pg_temp.payroll(11))$$,'net salary accepts omitted extras');
select is((pg_temp.terms(11)->>'employee_deductions')::numeric,0::numeric,'omitted net deductions are stored zero');
select is((pg_temp.terms(11)->>'employer_cost')::numeric,0::numeric,'omitted employer cost is stored zero');
select is(pg_temp.terms(11)->>'employer_cost_status','fixed','zero employer cost is fixed');
select is(pg_temp.source(11)->>'deductionsStatus','fixed','net zero deductions are complete in labor read model');
select is(pg_temp.source(11)->>'employerStatus','fixed','net zero employer cost is complete in labor read model');
select is((pg_temp.source(11)->>'knownCost')::numeric,1000::numeric,'net zero extras cost equals take-home pay');
select is((pg_temp.source(11)->>'canConfirm')::boolean,(select (now() at time zone 'Europe/Kyiv')::date >= (pg_temp.month()+interval '1 month - 1 day')::date),'open period remains distinct from component completeness');
select lives_ok($$select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(51),pg_temp.payroll(11))$$,'original raw request replay remains idempotent');
select lives_ok($$select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(52),pg_temp.payroll(12,'{"basis":"gross","employeeDeductions":"","employerCost":"","employerCostStatus":"fixed"}'))$$,'gross salary accepts blank extras');
select is((pg_temp.terms(12)->>'employee_payout')::numeric,1000::numeric,'gross zero deductions preserve payout relationship');
select is(pg_temp.source(12)->>'deductionsStatus','fixed','gross zero deductions are known');
select is((pg_temp.source(12)->>'knownCost')::numeric,1000::numeric,'gross employer cost zero leaves cost equal gross');
select lives_ok($$select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(53),pg_temp.payroll(14,'{"employeeDeductionsUnknown":"true","employerCostStatus":"unknown"}'))$$,'intentional net unknown remains supported');
select is(pg_temp.source(14)->>'deductionsStatus','unknown','intentional deductions remain incomplete');
select is(pg_temp.source(14)->>'employerStatus','unknown','intentional employer cost remains incomplete');
select throws_ok($$select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(54),pg_temp.payroll(13,'{"basis":"gross","employeeDeductionsUnknown":"true"}'))$$,'P0001','finance_compensation_invalid','gross payout requires known deductions');
select throws_ok($$select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(55),pg_temp.payroll(13,'{"employeeDeductionsUnknown":"true","employeeDeductions":"100"}'))$$,'P0001','finance_compensation_invalid','unknown flag cannot hide a supplied deduction');
select lives_ok($$select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(56),pg_temp.payroll(13,'{"basis":"gross","employeePayout":"900","employeeDeductions":"100","employerCost":"50","employerCostStatus":"fixed"}'))$$,'nonzero gross components retain existing formula');
select is((pg_temp.source(13)->>'knownCost')::numeric,1050::numeric,'gross cost does not add deductions twice');
select lives_ok($$select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(57),pg_temp.payroll(11)||jsonb_build_object('id',pg_temp.terms(11)->>'schedule_id','revision',1,'employeeDeductions','','employerCost',''))$$,'editable salary also defaults blank extras to zero');
select is(pg_temp.source(11)->>'employerStatus','fixed','edited zero remains complete');
reset role;
select is(pg_temp.terms(15),(select value from legacy_snapshot),'legacy null history remains untouched');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid(11)::text,true);
select throws_ok($$select public.save_finance_schedule(pg_temp.fid(1),pg_temp.fid(58),pg_temp.payroll(11))$$,'P0001','finance_admin_required','employee cannot invoke payroll defaults');
select * from finish();
rollback;
