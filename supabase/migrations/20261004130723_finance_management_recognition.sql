-- Management recognition is independent of account cash and payment schedules.
alter table public.finance_settings add column recognition_start_month date
  check(recognition_start_month=date_trunc('month',recognition_start_month)::date);

create table public.finance_recognition_entries (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id),
  kind text not null default 'recognition' check(kind in ('recognition','reversal','adjustment')),
  classification text not null check(classification in ('revenue','direct_cost','labor','overhead')),
  source_kind text not null constraint finance_recognition_source_kind_check check(source_kind in ('project_terms','expected','movement')),
  terms_id uuid,
  expected_item_id uuid,
  movement_id uuid,
  project_id uuid,
  category_id uuid not null,
  source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
  period_start date not null,
  period_end date not null check(period_end>=period_start),
  recognized_on date not null,
  description text not null check(char_length(btrim(description)) between 1 and 2000),
  currency text not null references public.finance_currencies(code),
  amount numeric not null check(amount<>0 and abs(amount)<=9999999999.9999),
  vat_amount numeric not null,
  gross_amount numeric not null check(gross_amount=amount+vat_amount),
  reporting_currency text not null references public.finance_currencies(code),
  reporting_amount numeric,
  fx_rate numeric,
  fx_source text,
  fx_effective_date date,
  related_entry_id uuid,
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id),
  foreign key(studio_id,terms_id,project_id) references public.finance_project_terms(studio_id,id,project_id),
  foreign key(studio_id,expected_item_id) references public.finance_expected_items(studio_id,id),
  foreign key(studio_id,movement_id) references public.finance_movements(studio_id,id),
  foreign key(project_id,studio_id) references public.projects(id,studio_id),
  foreign key(studio_id,category_id) references public.finance_categories(studio_id,id),
  foreign key(studio_id,related_entry_id) references public.finance_recognition_entries(studio_id,id),
  constraint finance_recognition_source_check check((source_kind='project_terms' and terms_id is not null and project_id is not null and expected_item_id is null and movement_id is null)
    or (source_kind='expected' and expected_item_id is not null and terms_id is null and movement_id is null)
    or (source_kind='movement' and movement_id is not null and terms_id is null and expected_item_id is null)),
  check((kind='recognition' and amount>0 and vat_amount>=0 and related_entry_id is null)
    or (kind='adjustment' and amount<0 and vat_amount<=0 and related_entry_id is not null)
    or (kind='reversal' and related_entry_id is not null and amount*vat_amount>=0)),
  check(classification<>'direct_cost' or project_id is not null),
  check(classification<>'overhead' or project_id is null),
  check((reporting_amount is null and fx_rate is null and fx_source is null and fx_effective_date is null)
    or (reporting_amount is not null and fx_rate>0 and fx_source in ('identity','manual','nbu') and fx_effective_date is not null))
);
create unique index finance_recognition_reversal_once on public.finance_recognition_entries(studio_id,related_entry_id) where kind='reversal';
create index finance_recognition_period_idx on public.finance_recognition_entries(studio_id,recognized_on,id);
create index finance_recognition_project_idx on public.finance_recognition_entries(studio_id,project_id,recognized_on);
create index finance_recognition_expected_idx on public.finance_recognition_entries(studio_id,expected_item_id);
create index finance_recognition_movement_idx on public.finance_recognition_entries(studio_id,movement_id);
create index finance_recognition_terms_idx on public.finance_recognition_entries(studio_id,terms_id,project_id);
create index finance_recognition_category_idx on public.finance_recognition_entries(studio_id,category_id);
create index finance_recognition_parent_idx on public.finance_recognition_entries(studio_id,related_entry_id);
create index finance_recognition_creator_idx on public.finance_recognition_entries(created_by);

-- Coverage is an explicit admin statement, including reviewed zero costs, not a period lock.
create table public.finance_report_coverage (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null references public.finance_settings(studio_id),
  project_id uuid, month date not null check(month=date_trunc('month',month)::date),
  reviewed_through date not null check(date_trunc('month',reviewed_through)::date=month),
  revenue_reviewed boolean not null, direct_costs_reviewed boolean not null,
  labor_reviewed boolean not null, overhead_reviewed boolean not null,
  revision integer not null check(revision>0), reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
  unique nulls not distinct(studio_id,project_id,month,revision),
  foreign key(project_id,studio_id) references public.projects(id,studio_id)
);
create index finance_coverage_creator_idx on public.finance_report_coverage(created_by);

do $$declare name text; begin
  foreach name in array array['finance_recognition_entries','finance_report_coverage'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy finance_admin_read on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',name);
  end loop;
end $$;
create trigger finance_coverage_immutable before update or delete on public.finance_report_coverage
  for each row execute function private.reject_finance_history_change();

create function private.guard_finance_recognition_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare digits integer;
begin
  -- Only unresolved valuation can be completed. Economic facts and resolved FX stay immutable.
  if tg_op<>'UPDATE' or old.reporting_amount is not null or new.reporting_amount is null
    or (to_jsonb(new)-array['reporting_amount','fx_rate','fx_source','fx_effective_date'])
      is distinct from (to_jsonb(old)-array['reporting_amount','fx_rate','fx_source','fx_effective_date'])
    then raise exception 'finance_history_immutable'; end if;
  select minor_units into digits from public.finance_currencies where code=new.reporting_currency;
  if new.fx_effective_date is distinct from coalesce((new.source_snapshot->>'recognitionDate')::date,new.recognized_on)
    or new.reporting_amount is distinct from round(new.amount*new.fx_rate,digits)
    or (new.currency=new.reporting_currency and (new.fx_rate<>1 or new.fx_source<>'identity'))
    then raise exception 'finance_fx_required'; end if;
  return new;
end $$;
revoke all on function private.guard_finance_recognition_history() from public,anon,authenticated,service_role;
create trigger finance_recognition_immutable before update or delete on public.finance_recognition_entries
  for each row execute function private.guard_finance_recognition_history();

create view public.finance_recognized_actuals with(security_invoker=true) as
select e.* from public.finance_recognition_entries e
where e.kind<>'reversal' and not exists(select 1 from public.finance_recognition_entries r
  where r.studio_id=e.studio_id and r.related_entry_id=e.id and r.kind='reversal');
create view public.finance_current_report_coverage with(security_invoker=true) as
select distinct on(studio_id,project_id,month) * from public.finance_report_coverage
order by studio_id,project_id,month,revision desc;
revoke all on public.finance_recognized_actuals,public.finance_current_report_coverage from public,anon,authenticated,service_role;
grant select on public.finance_recognized_actuals,public.finance_current_report_coverage to authenticated;

create function public.activate_finance_recognition(p_studio_id uuid,p_request_id uuid,p_month date) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','recognition_activation','month',p_month); result uuid; start_date date;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select recognition_start_month into start_date from public.finance_settings where studio_id=p_studio_id and finalized_at is not null;
  if not found or p_month is null or p_month<>date_trunc('month',p_month)::date
    or p_month<date_trunc('month',now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_input_invalid'; end if;
  if start_date is not null and start_date<>p_month then raise exception 'finance_recognition_start_locked'; end if;
  update public.finance_settings set recognition_start_month=p_month where studio_id=p_studio_id;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,p_studio_id,auth.uid(),now());
  return p_studio_id;
end $$;

-- Cancellation may replace a payment expectation with its retained paid portion.
-- That replacement is the same economic source, not a new performed service.
create function private.finance_recognition_expected_root(p_studio uuid,p_item uuid) returns uuid
language sql stable security invoker set search_path='' as $$
  with recursive lineage(id,depth) as (
    select p_item,0
    union all
    select (r.payload->'input'->>'itemId')::uuid,l.depth+1
    from lineage l join public.finance_planning_requests r on r.studio_id=p_studio and r.result_id=l.id
    where r.payload->>'operation'='project_cancellation' and r.result_id is distinct from (r.payload->'input'->>'itemId')::uuid
  ) select id from lineage order by depth desc limit 1
$$;
revoke all on function private.finance_recognition_expected_root(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.finance_recognition_expected_root(uuid,uuid) to authenticated;

create function private.post_finance_recognition(p_studio uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; terms public.finance_project_terms; item public.finance_expected_items;
  movement public.finance_movements; cash public.finance_movement_entries; cat public.finance_categories;
  project uuid:=nullif(p_input->>'projectId','')::uuid; source_id uuid:=(p_input->>'sourceId')::uuid;
  classification text:=p_input->>'classification'; source_kind text:=p_input->>'sourceKind';
  value numeric:=(p_input->>'amount')::numeric; day date:=(p_input->>'date')::date;
  first_day date:=(p_input->>'periodStart')::date; last_day date:=(p_input->>'periodEnd')::date;
  digits integer; cap numeric; consumed numeric; snapshot_consumed numeric; consumed_vat numeric; root_item uuid; snapshot jsonb; parts record; valuation record; rate numeric; fx_source text; fx_date date; report_value numeric; result uuid;
begin
  select * into setup from public.finance_settings where studio_id=p_studio;
  if setup.recognition_start_month is null then raise exception 'finance_recognition_inactive'; end if;
  if day is null or first_day is null or last_day is null or first_day>last_day or day not between first_day and last_day
    or first_day<setup.recognition_start_month or last_day>(now() at time zone 'Europe/Kyiv')::date
    or char_length(btrim(coalesce(p_input->>'description',''))) not between 1 and 2000
    or char_length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000
    then raise exception 'finance_input_invalid'; end if;
  if project is not null and not exists(select 1 from public.projects where studio_id=p_studio and id=project)
    then raise exception 'finance_project_invalid'; end if;
  if source_kind='project_terms' then
    select * into terms from public.finance_project_current_terms where studio_id=p_studio and id=source_id and stream='design';
    if not found or classification<>'revenue' or terms.project_id is distinct from project or terms.gross_amount is null
      then raise exception 'finance_recognition_source_invalid'; end if;
    select * into cat from public.finance_categories where studio_id=p_studio and default_key='project_payments';
    snapshot:=to_jsonb(terms); cap:=terms.net_amount;
    select minor_units into digits from public.finance_currencies where code=terms.currency;
    select * into parts from private.finance_vat_parts(value,terms.vat_rate,'net',digits);
    -- Terms revisions do not give the same design contract a second recognition allowance.
    select coalesce(sum(r.amount),0) into consumed from public.finance_recognition_entries r
      where r.studio_id=p_studio and r.project_id=project and r.classification='revenue' and r.currency=terms.currency
        and (r.source_kind='project_terms' or r.source_snapshot->>'stream'='design');
    select coalesce(sum(r.amount),0),coalesce(sum(r.vat_amount),0) into snapshot_consumed,consumed_vat
      from public.finance_recognition_entries r where r.studio_id=p_studio and r.terms_id=terms.id;
  elsif source_kind='expected' then
    select * into item from public.finance_expected_items where studio_id=p_studio and id=source_id and commitment='agreed' and certainty='fixed';
    if not found or exists(select 1 from public.finance_obligation_items l join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id where l.studio_id=p_studio and l.expected_item_id=source_id and o.kind in ('payroll','bonus'))
      or exists(select 1 from public.finance_trip_entries where studio_id=p_studio and expected_item_id=source_id)
      then raise exception 'finance_recognition_source_invalid'; end if;
    select * into cat from public.finance_categories where studio_id=p_studio and id=item.category_id and nature='operating' and default_key is distinct from 'salary' and default_key is distinct from 'employee_bonus';
    if not found or (item.direction='incoming') is distinct from (classification='revenue')
      or classification='labor' then raise exception 'finance_recognition_source_invalid'; end if;
    if exists(select 1 from public.finance_project_items where studio_id=p_studio and expected_item_id=source_id and project_id is distinct from project)
      then raise exception 'finance_project_invalid'; end if;
    if classification='direct_cost' and not cat.project_expense_enabled then raise exception 'finance_category_invalid'; end if;
    root_item:=private.finance_recognition_expected_root(p_studio,source_id);
    snapshot:=to_jsonb(item)||coalesce((select to_jsonb(p) from public.finance_project_items p where p.studio_id=p_studio and p.expected_item_id=source_id),'{}'::jsonb)||jsonb_build_object('economicExpectedId',root_item);
    cap:=item.net_amount; select minor_units into digits from public.finance_currencies where code=item.currency;
    select * into parts from private.finance_vat_parts(value,item.vat_rate,'net',digits);
    select coalesce(sum(r.amount),0),coalesce(sum(r.vat_amount),0) into consumed,consumed_vat from public.finance_recognition_entries r
      where r.studio_id=p_studio and (r.expected_item_id=root_item or r.source_snapshot->>'economicExpectedId'=root_item::text);
    snapshot_consumed:=consumed;
    if snapshot->>'stream'='design' then
      select * into terms from public.finance_project_current_terms where studio_id=p_studio and project_id=project and stream='design';
      if terms.currency<>item.currency or value+(select coalesce(sum(r.amount),0) from public.finance_recognition_entries r
        where r.studio_id=p_studio and r.project_id=project and r.classification='revenue' and r.currency=item.currency
          and (r.source_kind='project_terms' or r.source_snapshot->>'stream'='design'))>terms.net_amount
        then raise exception 'finance_recognition_over_source'; end if;
      terms:=null;
    end if;
  elsif source_kind='movement' then
    select * into movement from public.finance_current_movements where studio_id=p_studio and id=source_id and kind='outgoing' and nature='operating';
    if not found or classification not in ('direct_cost','overhead') or coalesce((movement.request_payload->>'allocationIntent')::boolean,false)
      or exists(select 1 from public.finance_allocations where studio_id=p_studio and movement_id=source_id)
      or exists(select 1 from public.finance_trip_entries where studio_id=p_studio and movement_id=source_id)
      then raise exception 'finance_recognition_source_invalid'; end if;
    select * into cash from public.finance_movement_entries where studio_id=p_studio and movement_id=source_id and entry_role='primary';
    select * into cat from public.finance_categories where studio_id=p_studio and id=movement.category_id and default_key is distinct from 'salary' and default_key is distinct from 'employee_bonus';
    if classification='direct_cost' and not cat.project_expense_enabled then raise exception 'finance_category_invalid'; end if;
    snapshot:=to_jsonb(movement)||jsonb_build_object('currency',cash.currency); cap:=abs(cash.amount);
    select minor_units into digits from public.finance_currencies where code=cash.currency;
    select * into parts from private.finance_vat_parts(value,null,'net',digits);
    select coalesce(sum(amount),0) into consumed from public.finance_recognition_entries where studio_id=p_studio and movement_id=source_id;
  else raise exception 'finance_recognition_source_invalid'; end if;
  if cat.id is null or value is null or value<=0 or value<>round(value,digits) or value+consumed>cap
    then raise exception 'finance_recognition_over_source'; end if;
  -- The final slice takes the residual snapshot VAT so partial confirmations conserve cents.
  if value+snapshot_consumed=cap and source_kind in ('project_terms','expected') then
    parts.vat_amount:=case when source_kind='project_terms' then terms.vat_amount else item.vat_amount end-consumed_vat;
    if parts.vat_amount<0 then raise exception 'finance_recognition_source_changed'; end if;
    parts.gross_amount:=value+parts.vat_amount;
  end if;
  if classification='direct_cost' and project is null or classification='overhead' and project is not null
    then raise exception 'finance_project_invalid'; end if;
  if snapshot->>'currency'=setup.base_currency or p_input->'fx' is not null and p_input->'fx'<>'null'::jsonb then
    select * into valuation from private.finance_valuation(snapshot->>'currency',setup.base_currency,day,value,p_input->'fx');
    rate:=valuation.rate; fx_source:=valuation.source; fx_date:=valuation.effective_date; report_value:=valuation.reporting_amount;
  end if;
  snapshot:=snapshot||jsonb_build_object('recognitionDate',day);
  insert into public.finance_recognition_entries(studio_id,classification,source_kind,terms_id,expected_item_id,movement_id,project_id,category_id,
    source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,
    reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by)
  values(p_studio,classification,source_kind,case when source_kind='project_terms' then source_id end,
    case when source_kind='expected' then source_id end,case when source_kind='movement' then source_id end,project,cat.id,snapshot,
    first_day,last_day,day,btrim(p_input->>'description'),snapshot->>'currency',value,parts.vat_amount,parts.gross_amount,
    setup.base_currency,report_value,rate,fx_source,fx_date,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  return result;
end $$;
revoke all on function private.post_finance_recognition(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.record_finance_recognition(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','recognition','input',p_input); result uuid;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  result:=private.post_finance_recognition(p_studio_id,p_input);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

create function public.adjust_finance_recognition(p_studio_id uuid,p_request_id uuid,p_entry_id uuid,p_input jsonb) returns uuid
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
    insert into public.finance_recognition_entries(studio_id,kind,classification,source_kind,terms_id,expected_item_id,movement_id,project_id,
      category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,
      reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,related_entry_id,reason,created_by)
    select studio_id,'reversal',classification,source_kind,terms_id,expected_item_id,movement_id,project_id,
      category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,-amount,-vat_amount,-gross_amount,
      reporting_currency,-reporting_amount,fx_rate,fx_source,fx_effective_date,id,btrim(p_input->>'reason'),auth.uid()
    from public.finance_recognized_actuals where studio_id=p_studio_id and related_entry_id=original.id and kind='adjustment';
  end if;
  insert into public.finance_recognition_entries(studio_id,kind,classification,source_kind,terms_id,expected_item_id,movement_id,project_id,
    category_id,source_snapshot,period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,
    reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,related_entry_id,reason,created_by)
  values(p_studio_id,case when operation='adjustment' then 'adjustment' else 'reversal' end,original.classification,original.source_kind,
    original.terms_id,original.expected_item_id,original.movement_id,original.project_id,original.category_id,original.source_snapshot,
    original.period_start,original.period_end,day,original.description,original.currency,-value,-vat,-(value+vat),original.reporting_currency,
    -report_value,original.fx_rate,original.fx_source,original.fx_effective_date,original.id,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  if operation='correction' then result:=private.post_finance_recognition(p_studio_id,p_input->'replacement'); end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

create function public.value_finance_recognition(p_studio_id uuid,p_entry_id uuid,p_fx jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare entry public.finance_recognition_entries; valuation record;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  select * into entry from public.finance_recognition_entries where studio_id=p_studio_id and id=p_entry_id and kind='recognition';
  if not found then raise exception 'finance_input_invalid'; end if;
  select * into valuation from private.finance_valuation(entry.currency,entry.reporting_currency,entry.recognized_on,entry.amount,p_fx);
  if entry.reporting_amount is not null then
    if row(entry.fx_rate,entry.fx_source,entry.fx_effective_date) is not distinct from row(valuation.rate,valuation.source,valuation.effective_date) then return; end if;
    raise exception 'finance_valuation_locked';
  end if;
  with recursive family as (
    select id from public.finance_recognition_entries where studio_id=p_studio_id and id=entry.id
    union all select e.id from public.finance_recognition_entries e join family f on e.related_entry_id=f.id where e.studio_id=p_studio_id
  )
  update public.finance_recognition_entries e set reporting_amount=round(e.amount*valuation.rate,c.minor_units),
    fx_rate=valuation.rate,fx_source=valuation.source,fx_effective_date=valuation.effective_date
  from public.finance_currencies c,family f where c.code=e.reporting_currency and e.studio_id=p_studio_id
    and e.id=f.id and e.reporting_amount is null;
end $$;

create function public.save_finance_report_coverage(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','recognition_coverage','input',p_input); result uuid;
  project uuid:=nullif(p_input->>'projectId','')::uuid; month date:=(p_input->>'month')::date;
  through_date date:=(p_input->>'through')::date; prior integer;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if (select recognition_start_month from public.finance_settings where studio_id=p_studio_id) is null
    or through_date>(now() at time zone 'Europe/Kyiv')::date or month<(select recognition_start_month from public.finance_settings where studio_id=p_studio_id)
    then raise exception 'finance_input_invalid'; end if;
  select revision into prior from public.finance_current_report_coverage where studio_id=p_studio_id and project_id is not distinct from project and finance_current_report_coverage.month=month;
  if coalesce(prior,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  insert into public.finance_report_coverage(studio_id,project_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,labor_reviewed,overhead_reviewed,revision,reason,created_by)
  values(p_studio_id,project,month,through_date,(p_input->>'revenue')::boolean,(p_input->>'direct_costs')::boolean,
    (p_input->>'labor')::boolean,(p_input->>'overhead')::boolean,coalesce(prior,0)+1,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

revoke all on function public.activate_finance_recognition(uuid,uuid,date),public.record_finance_recognition(uuid,uuid,jsonb),
  public.adjust_finance_recognition(uuid,uuid,uuid,jsonb),public.value_finance_recognition(uuid,uuid,jsonb),
  public.save_finance_report_coverage(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.activate_finance_recognition(uuid,uuid,date),public.record_finance_recognition(uuid,uuid,jsonb),
  public.adjust_finance_recognition(uuid,uuid,uuid,jsonb),public.value_finance_recognition(uuid,uuid,jsonb),
  public.save_finance_report_coverage(uuid,uuid,jsonb) to authenticated;

-- A standalone cash-expense source cannot later masquerade as another economic expense.
create function private.guard_recognized_finance_cash_match() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.amount>0 and exists(select 1 from public.finance_recognized_actuals
    where studio_id=new.studio_id and movement_id=new.movement_id)
    then raise exception 'finance_recognized_cash_source_locked'; end if;
  return new;
end $$;
revoke all on function private.guard_recognized_finance_cash_match() from public,anon,authenticated,service_role;
create trigger finance_recognized_cash_match_guard before insert on public.finance_allocations
  for each row execute function private.guard_recognized_finance_cash_match();

create function public.get_finance_recognition_sources(p_studio_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  with sources as (
    select 'project_terms'::text as kind,t.id as "sourceId",p.name||' · '||t.stream as label,t.project_id as "projectId",'revenue'::text as classification,
      t.currency,t.net_amount as amount,t.gross_amount as gross,
      t.net_amount-coalesce((select sum(r.amount) from public.finance_recognition_entries r
        where r.studio_id=t.studio_id and r.project_id=t.project_id and r.classification='revenue' and r.currency=t.currency
          and (r.source_kind='project_terms' or r.source_snapshot->>'stream'='design')),0) as remaining,
      null::date as "periodStart",null::date as "periodEnd",t.revision as version
    from public.finance_project_current_terms t join public.projects p on p.id=t.project_id and p.studio_id=t.studio_id
    where t.studio_id=p_studio_id and t.stream='design'
    union all
    select 'expected',i.id,coalesce(nullif(i.description,''),c.name),p.project_id,
      case when i.direction='incoming' then 'revenue' when p.project_id is not null then 'direct_cost' else 'overhead' end,
      i.currency,i.net_amount,i.amount,i.net_amount-coalesce((select sum(r.amount) from public.finance_recognition_entries r
        where r.studio_id=i.studio_id and (r.expected_item_id=private.finance_recognition_expected_root(i.studio_id,i.id)
          or r.source_snapshot->>'economicExpectedId'=private.finance_recognition_expected_root(i.studio_id,i.id)::text)),0),p.period_start,
      case when p.period_start is not null then (p.period_start+interval '1 month - 1 day')::date end,i.version
    from public.finance_expected_items i join public.finance_categories c on c.studio_id=i.studio_id and c.id=i.category_id
    left join public.finance_project_items p on p.studio_id=i.studio_id and p.expected_item_id=i.id
    where i.studio_id=p_studio_id and c.nature='operating' and c.default_key is distinct from 'salary' and c.default_key is distinct from 'employee_bonus' and i.commitment='agreed' and i.certainty='fixed'
      and not exists(select 1 from public.finance_obligation_items l join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id where l.studio_id=i.studio_id and l.expected_item_id=i.id and o.kind in ('payroll','bonus'))
      and not exists(select 1 from public.finance_trip_entries t where t.studio_id=i.studio_id and t.expected_item_id=i.id)
    union all
    select 'movement',m.id,coalesce(nullif(m.description,''),m.category),null::uuid,'overhead',e.currency,abs(e.amount),abs(e.amount),
      abs(e.amount)-coalesce((select sum(r.amount) from public.finance_recognition_entries r where r.studio_id=m.studio_id and r.movement_id=m.id),0),
      m.financial_date,m.financial_date,1
    from public.finance_current_movements m join public.finance_movement_entries e on e.studio_id=m.studio_id and e.movement_id=m.id and e.entry_role='primary'
    where m.studio_id=p_studio_id and m.kind='outgoing' and m.nature='operating'
      and not exists(select 1 from public.finance_categories c where c.studio_id=m.studio_id and c.id=m.category_id and c.default_key in ('salary','employee_bonus'))
      and not coalesce((m.request_payload->>'allocationIntent')::boolean,false)
      and not exists(select 1 from public.finance_allocations a where a.studio_id=m.studio_id and a.movement_id=m.id)
      and not exists(select 1 from public.finance_trip_entries t where t.studio_id=m.studio_id and t.movement_id=m.id)
  ) select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('amount',s.amount::text,'gross',s.gross::text,'remaining',s.remaining::text) order by s.label,s."sourceId"),'[]'::jsonb)
    into result from sources s;
  return result;
end $$;
revoke all on function public.get_finance_recognition_sources(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_recognition_sources(uuid) to authenticated;

create function private.guard_finance_recognized_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='finance_expected_items' then
    if row(new.direction,new.currency,new.amount,new.net_amount,new.vat_amount,new.vat_rate,new.price_basis,new.category_id)
      is distinct from row(old.direction,old.currency,old.amount,old.net_amount,old.vat_amount,old.vat_rate,old.price_basis,old.category_id)
      and exists(select 1 from public.finance_recognized_actuals where studio_id=old.studio_id and expected_item_id=old.id)
      then raise exception 'finance_recognized_source_locked'; end if;
  elsif tg_table_name='finance_movements' then
    if new.kind='reversal' and exists(select 1 from public.finance_recognized_actuals where studio_id=new.studio_id and movement_id=new.related_movement_id)
      then raise exception 'finance_recognized_source_locked'; end if;
  elsif tg_table_name='finance_project_terms' then
    if new.stream='design' and exists(select 1 from public.finance_recognized_actuals r
      where r.studio_id=new.studio_id and r.project_id=new.project_id and r.classification='revenue'
        and r.currency<>new.currency and (r.source_kind='project_terms' or r.source_snapshot->>'stream'='design'))
      then raise exception 'finance_recognition_currency_locked'; end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_finance_recognized_source() from public,anon,authenticated,service_role;
create trigger finance_recognized_expected_guard before update on public.finance_expected_items for each row execute function private.guard_finance_recognized_source();
create trigger finance_recognized_movement_guard before insert on public.finance_movements for each row execute function private.guard_finance_recognized_source();
create trigger finance_recognized_terms_guard before insert on public.finance_project_terms for each row execute function private.guard_finance_recognized_source();
