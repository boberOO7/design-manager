begin;
select no_plan();
create function pg_temp.basis() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'source',jsonb_build_object('sourceReady',true,'knownCost','1000','recognizedCost','0','remainingCost','1000',
      'currency','UAH','basis','net','deductionsStatus','fixed','employerStatus','fixed'),
    'pools','[]'::jsonb,'manual',false,'issues','[]'::jsonb,'reportingCurrency','UAH','proposalFx',null,
    'proposedAllocations',jsonb_build_array(jsonb_build_object('projectId','client','amount','100')),'proposedRemainder','900',
    'shares',jsonb_build_object('client',100),'expectedMinutes',1000,'accruedFrom',today-4,'asOf',today,'periodEnd',today+10,
    'days',jsonb_build_array(
      jsonb_build_object('date',today-5,'submitted',true,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb),
      jsonb_build_object('date',today-4,'submitted',true,'employed',true,'scheduled',200,'absence',0,'loggedMinutes',400,
        'entries',jsonb_build_array(jsonb_build_object('projectId','client','minutes',200))),
      jsonb_build_object('date',today-3,'submitted',false,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb),
      jsonb_build_object('date',today-2,'submitted',false,'employed',true,'scheduled',200,'absence',200,'entries','[]'::jsonb),
      jsonb_build_object('date',today-1,'submitted',true,'employed',true,'scheduled',200,'absence',0,'loggedMinutes',200,'entries','[]'::jsonb),
      jsonb_build_object('date',today,'submitted',false,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb),
      jsonb_build_object('date',today+1,'submitted',true,'employed',true,'scheduled',200,'absence',0,'entries','[]'::jsonb)))
  from (select (now() at time zone 'Europe/Kyiv')::date as today) day
$$;
create function pg_temp.total(value jsonb) returns numeric language sql immutable as $$
  select (value->>'provisionalRemainder')::numeric+coalesce((select sum((a->>'amount')::numeric)
    from jsonb_array_elements(value->'provisionalDailyAllocations') a),0)
$$;
select is(pg_temp.total(private.finance_provisional_labor_values(pg_temp.basis())),800::numeric,
  'elapsed known salary includes missing Worklog, approved leave and internal-only work');
select is((private.finance_provisional_labor_values(pg_temp.basis())->>'provisionalRemainder')::numeric,700::numeric,
  'only the reliable client share leaves the studio remainder');
select is((select sum((a->>'amount')::numeric) from jsonb_array_elements(private.finance_provisional_labor_values(pg_temp.basis())->'provisionalDailyAllocations') a),100::numeric,
  'actual project time is capped using all logged time, including taskless internal work');
select is(pg_temp.total(private.finance_provisional_labor_values(jsonb_set(pg_temp.basis(),'{days,1,submitted}','false'))),800::numeric,
  'removing submitted evidence changes attribution without removing known elapsed salary');
select is(jsonb_array_length(private.finance_provisional_labor_values(jsonb_set(pg_temp.basis(),'{days,1,submitted}','false'))->'provisionalDailyAllocations'),0,
  'unsubmitted project time cannot acquire a reliable project allocation');
select is(pg_temp.total(private.finance_provisional_labor_values(jsonb_set(pg_temp.basis(),'{days,5,absence}','100'))),900::numeric,
  'approved partial leave today retains the existing absence accrual rule');
select is(pg_temp.total(private.finance_provisional_labor_values(jsonb_set(pg_temp.basis(),'{days,5,submitted}','true'))),1000::numeric,
  'a submitted current day accrues scheduled capacity while future days stay excluded');
select is(private.finance_provisional_labor_values(jsonb_set(pg_temp.basis(),'{source}','null'))->>'provisionalRemainder',null,
  'missing payroll terms never produce an assumed salary');
select is(private.finance_provisional_labor_values(jsonb_set(pg_temp.basis(),'{issues}','["partial_employment"]'))->>'provisionalRemainder',null,
  'employment ambiguity preserves its existing accrual guard');
select is(pg_temp.total(private.finance_provisional_labor_values(jsonb_set(pg_temp.basis(),'{issues}','["unknown_employer_cost"]'))),800::numeric,
  'an unknown extra component does not erase the supported known salary subtotal');

create function pg_temp.closed_basis() returns jsonb language sql stable as $$
  select pg_temp.basis()||jsonb_build_object('periodEnd',(now() at time zone 'Europe/Kyiv')::date-1,
    'asOf',(now() at time zone 'Europe/Kyiv')::date-1,
    'source',(pg_temp.basis()->'source')||jsonb_build_object('recognizedCost','400','remainingCost','600'),
    'pools',jsonb_build_array(jsonb_build_object('native','400','available','400','fx',null)))
$$;
select is(pg_temp.total(private.finance_provisional_labor_values(pg_temp.closed_basis())),600::numeric,
  'closed provisional cost includes only the remaining native salary, not prior pools');
select is((select sum((a->>'amount')::numeric) from jsonb_array_elements(private.finance_provisional_labor_values(pg_temp.closed_basis())->'provisionalDailyAllocations') a),60::numeric,
  'closed partial recognition attributes only the remaining cost using the established shares');
select is(pg_temp.total(private.finance_provisional_labor_values(jsonb_set(pg_temp.closed_basis(),'{issues}','["missing_capacity"]'))),600::numeric,
  'missing historical capacity does not erase a supported closed payroll amount');
select is(jsonb_array_length(private.finance_provisional_labor_values(jsonb_set(pg_temp.closed_basis(),'{issues}','["missing_capacity"]'))->'provisionalDailyAllocations'),0,
  'missing historical capacity prevents project attribution without guessing a rate');
select ok((select bool_and(a->>'date'=pg_temp.closed_basis()->>'periodEnd') from jsonb_array_elements(private.finance_provisional_labor_values(pg_temp.closed_basis())->'provisionalDailyAllocations') a),
  'closed provisional allocations use the same period-end date as final recognition');
select is(pg_temp.total(private.finance_provisional_labor_values(jsonb_set(pg_temp.closed_basis(),'{source,currency}','"USD"')
  ||jsonb_build_object('proposalFx',jsonb_build_object('rate','2','source','manual','effectiveDate',pg_temp.closed_basis()->>'periodEnd')))),1200::numeric,
  'foreign provisional cost values only the native remainder with the dated proposal FX');
select is(private.finance_provisional_labor_values(jsonb_set(pg_temp.closed_basis(),'{source,currency}','"USD"'))->>'provisionalRemainder',null,
  'missing historical FX remains unknown rather than zero or an invented quote');
select ok(private.finance_provisional_labor_values(jsonb_set(pg_temp.closed_basis(),'{source,currency}','"USD"'))->'issues' ? 'fx_required',
  'missing closed-period FX has an explicit warning');
select is(private.finance_provisional_labor_values(jsonb_set(pg_temp.closed_basis(),'{source,sourceReady}','false'))->>'provisionalRemainder',null,
  'a closed period with an unavailable payroll source is not estimated');
select * from finish();
rollback;
