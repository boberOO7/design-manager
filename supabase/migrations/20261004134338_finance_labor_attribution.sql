-- Confirmed employee-period labor remains one studio cost. Attribution only
-- divides its reporting value; it never posts another economic expense.
alter table public.finance_recognition_entries
  add column obligation_id uuid,
  add column employee_id uuid,
  add foreign key(studio_id,obligation_id) references public.finance_obligations(studio_id,id),
  add foreign key(studio_id,employee_id) references public.studio_members(studio_id,user_id),
  drop constraint finance_recognition_source_kind_check,
  drop constraint finance_recognition_source_check;
alter table public.finance_recognition_entries
  add constraint finance_recognition_source_kind_check check(source_kind in ('project_terms','expected','movement','labor')),
  add constraint finance_recognition_source_check check(
    (source_kind='project_terms' and terms_id is not null and project_id is not null and expected_item_id is null and movement_id is null and obligation_id is null and employee_id is null)
    or (source_kind='expected' and expected_item_id is not null and terms_id is null and movement_id is null and obligation_id is null and employee_id is null)
    or (source_kind='movement' and movement_id is not null and terms_id is null and expected_item_id is null and obligation_id is null and employee_id is null)
    or (source_kind='labor' and classification='labor' and obligation_id is not null and employee_id is not null and project_id is null and terms_id is null and expected_item_id is null and movement_id is null));
create index finance_recognition_obligation_idx on public.finance_recognition_entries(studio_id,obligation_id);
create index finance_recognition_employee_idx on public.finance_recognition_entries(studio_id,employee_id,recognized_on);
create or replace view public.finance_recognized_actuals with(security_invoker=true) as
select e.* from public.finance_recognition_entries e
where e.kind<>'reversal' and not exists(select 1 from public.finance_recognition_entries r
  where r.studio_id=e.studio_id and r.related_entry_id=e.id and r.kind='reversal');

create table public.finance_labor_allocation_revisions (
  id uuid primary key default gen_random_uuid(),studio_id uuid not null references public.finance_settings(studio_id),
  entry_id uuid not null, revision integer not null check(revision>0),
  method text not null default 'manual_management' check(method='manual_management'),
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id),unique(studio_id,entry_id,revision),
  foreign key(studio_id,entry_id) references public.finance_recognition_entries(studio_id,id)
);
create table public.finance_labor_allocation_items (
  id uuid primary key default gen_random_uuid(),studio_id uuid not null,revision_id uuid not null,project_id uuid not null,
  amount numeric not null check(amount>0 and amount<=9999999999.9999),
  unique(studio_id,revision_id,project_id),
  foreign key(studio_id,revision_id) references public.finance_labor_allocation_revisions(studio_id,id),
  foreign key(project_id,studio_id) references public.projects(id,studio_id)
);
create index finance_labor_project_idx on public.finance_labor_allocation_items(studio_id,project_id);
create index finance_labor_revision_creator_idx on public.finance_labor_allocation_revisions(created_by);
do $$declare name text; begin
  foreach name in array array['finance_labor_allocation_revisions','finance_labor_allocation_items'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy finance_admin_read on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',name);
    execute format('create trigger finance_labor_history_immutable before update or delete on public.%I for each row execute function private.reject_finance_history_change()',name);
  end loop;
end $$;

create view public.finance_current_labor_allocations with(security_invoker=true) as
select i.*,r.entry_id,r.revision,r.method,r.reason,r.created_by,r.created_at
from public.finance_labor_allocation_items i join public.finance_labor_allocation_revisions r on r.studio_id=i.studio_id and r.id=i.revision_id
where not exists(select 1 from public.finance_labor_allocation_revisions n where n.studio_id=r.studio_id and n.entry_id=r.entry_id and n.revision>r.revision);
create view public.finance_labor_cost_pools with(security_invoker=true) as
select e.*,
  case when e.reporting_amount is null then null else e.reporting_amount+coalesce((select sum(a.reporting_amount) from public.finance_recognized_actuals a where a.studio_id=e.studio_id and a.related_entry_id=e.id and a.kind='adjustment'),0) end as available_reporting_amount,
  e.amount+coalesce((select sum(a.amount) from public.finance_recognized_actuals a where a.studio_id=e.studio_id and a.related_entry_id=e.id and a.kind='adjustment'),0) as available_native_amount,
  coalesce((select sum(a.amount) from public.finance_current_labor_allocations a where a.studio_id=e.studio_id and a.entry_id=e.id),0) as allocated_amount,
  coalesce((select max(r.revision) from public.finance_labor_allocation_revisions r where r.studio_id=e.studio_id and r.entry_id=e.id),0) as allocation_revision
from public.finance_recognized_actuals e where e.source_kind='labor' and e.kind='recognition';
revoke all on public.finance_current_labor_allocations,public.finance_labor_cost_pools from public,anon,authenticated,service_role;
grant select on public.finance_current_labor_allocations,public.finance_labor_cost_pools to authenticated;

create function private.finance_labor_source(p_studio uuid,p_obligation uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare obligation public.finance_obligations; terms public.finance_schedule_terms; payout public.finance_expected_items;
  deductions public.finance_payroll_cost_revisions; employer public.finance_payroll_cost_revisions;
  deductions_status text; employer_status text; deductions_value numeric; employer_value numeric;
  known numeric; consumed numeric; snapshot jsonb; result jsonb; code text;
begin
  select * into obligation from public.finance_obligations where studio_id=p_studio and id=p_obligation and kind in ('payroll','bonus');
  if not found then return null; end if;
  select * into terms from public.finance_schedule_terms where studio_id=p_studio and id=obligation.terms_id;
  select i.* into payout from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
    where l.studio_id=p_studio and l.obligation_id=p_obligation and l.component in ('payout','bonus');
  select * into deductions from public.finance_payroll_cost_revisions where studio_id=p_studio and obligation_id=p_obligation and component='deductions' order by revision desc limit 1;
  select * into employer from public.finance_payroll_cost_revisions where studio_id=p_studio and obligation_id=p_obligation and component='employer_cost' order by revision desc limit 1;
  code:=coalesce(terms.currency,payout.currency);
  if code is null then return null; end if;
  deductions_status:=coalesce(deductions.status,case when terms.employee_deductions is null then 'unknown' else 'fixed' end);
  employer_status:=coalesce(employer.status,terms.employer_cost_status,'unknown');
  deductions_value:=case when deductions_status='fixed' then coalesce(deductions.amount,terms.employee_deductions,0) else 0 end;
  employer_value:=case when employer_status='fixed' then coalesce(employer.amount,terms.employer_cost,0) else 0 end;
  if obligation.kind='bonus' then
    known:=case when payout.commitment='agreed' and payout.certainty='fixed' then payout.amount else 0 end;
    deductions_status:='fixed';employer_status:='fixed';
  elsif terms.basis='gross' then known:=terms.amount+employer_value;
  else known:=coalesce(terms.employee_payout,terms.amount)+deductions_value+employer_value;
  end if;
  select coalesce(sum(r.amount),0) into consumed from public.finance_recognition_entries r where r.studio_id=p_studio and r.obligation_id=p_obligation;
  snapshot:=jsonb_build_object('obligation',to_jsonb(obligation),'terms',to_jsonb(terms),'payout',to_jsonb(payout),
    'deductionsRevision',to_jsonb(deductions),'employerRevision',to_jsonb(employer),'deductionsStatus',deductions_status,'employerStatus',employer_status,
    'knownCost',known::text,'currency',code);
  result:=jsonb_build_object('obligationId',obligation.id,'employeeId',obligation.employee_id,'label',obligation.employee_name,
    'kind',obligation.kind,'periodStart',obligation.period_start,'periodEnd',obligation.period_end,'currency',code,
    'knownCost',known::text,'recognizedCost',consumed::text,'remainingCost',(known-consumed)::text,
    'deductionsStatus',deductions_status,'employerStatus',employer_status,'basis',coalesce(terms.basis,'bonus'),
    'version',md5(snapshot::text),'snapshot',snapshot,
    'sourceReady',coalesce(payout.commitment='agreed' and payout.certainty='fixed' or obligation.kind='payroll' and terms.amount=0,false),
    'canConfirm',obligation.period_end<=(now() at time zone 'Europe/Kyiv')::date
      and coalesce(payout.commitment='agreed' and payout.certainty='fixed' or obligation.kind='payroll' and terms.amount=0,false));
  return result;
end $$;
revoke all on function private.finance_labor_source(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.finance_labor_source(uuid,uuid) to authenticated;

create function public.get_finance_labor_sources(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select coalesce(jsonb_agg(s.source order by o.period_start,o.employee_name,o.id),'[]') into result
    from public.finance_obligations o join public.finance_settings f on f.studio_id=o.studio_id
    cross join lateral (select private.finance_labor_source(o.studio_id,o.id) as source) s
    where o.studio_id=p_studio_id and o.kind in ('payroll','bonus') and o.period_start>=f.recognition_start_month
      and o.period_start<=(now() at time zone 'Europe/Kyiv')::date and s.source is not null
      and ((s.source->>'sourceReady')::boolean or (s.source->>'recognizedCost')::numeric>0);
  return result;
end $$;

create function public.record_finance_labor_cost(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','labor_recognition','input',p_input);result uuid; source jsonb;
  obligation uuid:=(p_input->>'obligationId')::uuid; value numeric; day date; start_date date; cat uuid; valuation record;
  snapshot jsonb; rate numeric; rate_source text; rate_date date; reporting_value numeric;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  source:=private.finance_labor_source(p_studio_id,obligation);
  select recognition_start_month into start_date from public.finance_settings where studio_id=p_studio_id;
  if source is null or start_date is null or (source->>'periodStart')::date<start_date or not (source->>'canConfirm')::boolean
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000 then raise exception 'finance_input_invalid'; end if;
  if source->>'version' is distinct from p_input->>'version' then raise exception 'finance_version_conflict'; end if;
  value:=(source->>'remainingCost')::numeric;day:=(source->>'periodEnd')::date;
  if value<=0 then raise exception 'finance_labor_no_remaining_cost'; end if;
  select id into cat from public.finance_categories where studio_id=p_studio_id and default_key=case when source->>'kind'='bonus' then 'employee_bonus' else 'salary' end;
  snapshot:=source->'snapshot'||jsonb_build_object('recognitionDate',day);
  if source->>'currency'=(select base_currency from public.finance_settings where studio_id=p_studio_id) or p_input->'fx' is not null and p_input->'fx'<>'null'::jsonb then
    select * into valuation from private.finance_valuation(source->>'currency',(select base_currency from public.finance_settings where studio_id=p_studio_id),day,value,p_input->'fx');
    rate:=valuation.rate;rate_source:=valuation.source;rate_date:=valuation.effective_date;reporting_value:=valuation.reporting_amount;
  end if;
  insert into public.finance_recognition_entries(studio_id,classification,source_kind,obligation_id,employee_id,category_id,source_snapshot,
    period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by)
  values(p_studio_id,'labor','labor',obligation,(source->>'employeeId')::uuid,cat,snapshot,(source->>'periodStart')::date,day,day,
    source->>'label',source->>'currency',value,0,value,(select base_currency from public.finance_settings where studio_id=p_studio_id),
    reporting_value,rate,rate_source,rate_date,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

create function public.save_finance_labor_allocation(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','labor_allocation','entry',p_entry_id,'input',p_input);result uuid;
  pool public.finance_labor_cost_pools; part jsonb; total numeric:=0; part_value numeric; digits integer; target uuid;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into pool from public.finance_labor_cost_pools where studio_id=p_studio_id and id=p_entry_id;
  if not found or jsonb_typeof(p_input->'items') is distinct from 'array'
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000 then raise exception 'finance_input_invalid'; end if;
  if pool.available_reporting_amount is null and jsonb_array_length(p_input->'items')>0 then raise exception 'finance_fx_required';end if;
  if pool.allocation_revision is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  select minor_units into digits from public.finance_currencies where code=pool.reporting_currency;
  if (select count(*) from jsonb_array_elements(p_input->'items'))<>(select count(distinct value->>'projectId') from jsonb_array_elements(p_input->'items')) then raise exception 'finance_input_invalid'; end if;
  for part in select value from jsonb_array_elements(p_input->'items') loop
    part_value:=(part->>'amount')::numeric;target:=(part->>'projectId')::uuid;
    if part_value is null or part_value<=0 or part_value<>round(part_value,digits) or target is null or not exists(select 1 from public.projects where studio_id=p_studio_id and id=target)
      then raise exception 'finance_input_invalid'; end if;
    total:=total+part_value;
  end loop;
  if total>coalesce(pool.available_reporting_amount,0) then raise exception 'finance_labor_overallocated'; end if;
  insert into public.finance_labor_allocation_revisions(studio_id,entry_id,revision,reason,created_by)
    values(p_studio_id,p_entry_id,pool.allocation_revision+1,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_labor_allocation_items(studio_id,revision_id,project_id,amount)
    select p_studio_id,result,(v->>'projectId')::uuid,(v->>'amount')::numeric from jsonb_array_elements(p_input->'items') v;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

create function private.guard_finance_labor_allocation_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare pool_id uuid;available numeric;allocated numeric;
begin
  if new.source_kind<>'labor' then return new; end if;
  pool_id:=case when new.kind='recognition' then new.id else new.related_entry_id end;
  select coalesce(sum(amount),0) into allocated from public.finance_current_labor_allocations where studio_id=new.studio_id and entry_id=pool_id;
  select available_reporting_amount into available from public.finance_labor_cost_pools where studio_id=new.studio_id and id=pool_id;
  if allocated>coalesce(available,0) then raise exception 'finance_labor_overallocated'; end if;
  return new;
end $$;
revoke all on function private.guard_finance_labor_allocation_capacity() from public,anon,authenticated,service_role;
create trigger finance_labor_capacity_guard after insert on public.finance_recognition_entries for each row execute function private.guard_finance_labor_allocation_capacity();

-- Append-only confirmation consumes the payroll terms even after earned flags
-- are cleared or the financial recognition is later corrected.
create or replace function private.finance_payroll_term_consumed(p_studio uuid,p_term uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.finance_obligations o where o.studio_id=p_studio and o.terms_id=p_term and (
    exists(select 1 from public.finance_recognition_entries r where r.studio_id=o.studio_id and r.obligation_id=o.id)
    or exists(select 1 from public.finance_payroll_cost_revisions r where r.studio_id=o.studio_id and r.obligation_id=o.id)
    or exists(select 1 from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where l.studio_id=o.studio_id and l.obligation_id=o.id and (i.is_established or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id)))
  ));
$$;
revoke all on function public.get_finance_labor_sources(uuid),public.record_finance_labor_cost(uuid,uuid,jsonb),public.save_finance_labor_allocation(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_labor_sources(uuid),public.record_finance_labor_cost(uuid,uuid,jsonb),public.save_finance_labor_allocation(uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.adjust_finance_recognition(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','recognition_adjustment','entry',p_entry_id,'input',p_input);
  result uuid; original public.finance_recognition_entries; value numeric; vat numeric; report_value numeric; digits integer; day date; operation text:=p_input->>'operation';
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into original from public.finance_recognized_actuals where studio_id=p_studio_id and id=p_entry_id and kind='recognition';
  if not found or operation not in ('correction','cancel','adjustment') or operation is null
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000 then raise exception 'finance_input_invalid'; end if;
  value:=case when operation='adjustment' then (p_input->>'amount')::numeric else original.amount end;
  day:=case when operation='adjustment' then (p_input->>'date')::date else original.recognized_on end;
  select minor_units into digits from public.finance_currencies where code=original.currency;
  if value is null or value<=0 or value<>round(value,digits) or day is null
    or day>(now() at time zone 'Europe/Kyiv')::date or day<original.recognized_on
    or operation='adjustment' and value>original.amount+coalesce((select sum(amount) from public.finance_recognition_entries
      where studio_id=p_studio_id and related_entry_id=original.id and kind='adjustment'),0)
    then raise exception 'finance_recognition_over_source'; end if;
  vat:=case when value=original.amount then original.vat_amount else round(original.vat_amount*value/original.amount,digits) end;
  select minor_units into digits from public.finance_currencies where code=original.reporting_currency;
  report_value:=case when value=original.amount then original.reporting_amount else round(value*original.fx_rate,digits) end;
  -- An error correction also removes earlier economic adjustments to this fact.
  -- Mirror each signed child exactly; the original and its children then consume zero.
  if operation in ('correction','cancel') then
    insert into public.finance_recognition_entries(studio_id,kind,classification,source_kind,terms_id,expected_item_id,movement_id,obligation_id,employee_id,project_id,
      category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,
      reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,related_entry_id,reason,created_by)
    select studio_id,'reversal',classification,source_kind,terms_id,expected_item_id,movement_id,obligation_id,employee_id,project_id,
      category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,-amount,-vat_amount,-gross_amount,
      reporting_currency,-reporting_amount,fx_rate,fx_source,fx_effective_date,id,btrim(p_input->>'reason'),auth.uid()
    from public.finance_recognized_actuals where studio_id=p_studio_id and related_entry_id=original.id and kind='adjustment';
  end if;
  insert into public.finance_recognition_entries(studio_id,kind,classification,source_kind,terms_id,expected_item_id,movement_id,obligation_id,employee_id,project_id,
    category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,
    reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,related_entry_id,reason,created_by)
  values(p_studio_id,case when operation='adjustment' then 'adjustment' else 'reversal' end,original.classification,original.source_kind,
    original.terms_id,original.expected_item_id,original.movement_id,original.obligation_id,original.employee_id,original.project_id,original.category_id,original.source_snapshot,
    original.period_start,original.period_end,day,original.description,original.currency,-value,-vat,-(value+vat),original.reporting_currency,
    -report_value,original.fx_rate,original.fx_source,original.fx_effective_date,original.id,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  if operation='correction' then result:=private.post_finance_recognition(p_studio_id,p_input->'replacement'); end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

-- Replace erroneous labor confirmation and its manual attribution together.
-- The submitted replacement splits are explicit admin decisions, not a new
-- automatic allocation method. Previous snapshots remain immutable.
create function public.reconcile_finance_labor_cost(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','labor_reconciliation','input',p_input);result uuid;
  source jsonb;pool public.finance_labor_cost_pools;obligation uuid:=(p_input->>'obligationId')::uuid;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  source:=private.finance_labor_source(p_studio_id,obligation);
  if source is null or source->>'version' is distinct from p_input->>'version'
    then raise exception 'finance_version_conflict';end if;
  if jsonb_typeof(p_input->'items') is distinct from 'array' or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000
    then raise exception 'finance_input_invalid';end if;
  for pool in select * from public.finance_labor_cost_pools where studio_id=p_studio_id and obligation_id=obligation order by id loop
    perform public.save_finance_labor_allocation(p_studio_id,gen_random_uuid(),pool.id,jsonb_build_object('revision',pool.allocation_revision,'items','[]'::jsonb,'reason',p_input->>'reason'));
    perform public.adjust_finance_recognition(p_studio_id,gen_random_uuid(),pool.id,jsonb_build_object('operation','cancel','reason',p_input->>'reason'));
  end loop;
  if (source->>'knownCost')::numeric>0 then
    result:=public.record_finance_labor_cost(p_studio_id,gen_random_uuid(),p_input);
    perform public.save_finance_labor_allocation(p_studio_id,gen_random_uuid(),result,jsonb_build_object('revision',0,'items',p_input->'items','reason',p_input->>'reason'));
  else
    if jsonb_array_length(p_input->'items')>0 then raise exception 'finance_labor_overallocated';end if;
    result:=obligation;
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;
revoke all on function public.reconcile_finance_labor_cost(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_finance_labor_cost(uuid,uuid,jsonb) to authenticated;

create function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return jsonb_build_object('sources',public.get_finance_labor_sources(p_studio_id),
    'pools',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'obligation_id',p.obligation_id,'employee_id',p.employee_id,'description',p.description,
      'period_start',p.period_start,'period_end',p.period_end,'recognized_on',p.recognized_on,'currency',p.currency,'amount',p.amount::text,
      'reporting_currency',p.reporting_currency,'available_reporting_amount',p.available_reporting_amount::text,'allocated_amount',p.allocated_amount::text,
      'allocation_revision',p.allocation_revision,'fx_rate',p.fx_rate::text,'fx_source',p.fx_source,'fx_effective_date',p.fx_effective_date) order by p.period_start,p.description,p.id)
      from public.finance_labor_cost_pools p where p.studio_id=p_studio_id),'[]'),
    'allocations',coalesce((select jsonb_agg(jsonb_build_object('entry_id',a.entry_id,'project_id',a.project_id,'amount',a.amount::text,'revision',a.revision,'reason',a.reason,'created_at',a.created_at) order by a.entry_id,a.project_id)
      from public.finance_current_labor_allocations a where a.studio_id=p_studio_id),'[]'));
end $$;
revoke all on function public.get_finance_labor_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_labor_reporting(uuid) to authenticated;

create function private.guard_finance_recognized_payroll_payout() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.commitment='cancelled' and old.commitment<>'cancelled' and exists(
    select 1 from public.finance_obligation_items l where l.studio_id=old.studio_id and l.expected_item_id=old.id and l.component in ('payout','bonus')
      and (select coalesce(sum(r.amount),0) from public.finance_recognition_entries r where r.studio_id=l.studio_id and r.obligation_id=l.obligation_id)>0
  ) then raise exception 'finance_payroll_consumed';end if;
  return new;
end $$;
revoke all on function private.guard_finance_recognized_payroll_payout() from public,anon,authenticated,service_role;
create trigger finance_recognized_payroll_payout_guard before update on public.finance_expected_items for each row execute function private.guard_finance_recognized_payroll_payout();
