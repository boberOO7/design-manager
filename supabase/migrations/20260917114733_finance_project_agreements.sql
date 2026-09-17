-- Commercial terms and source context only. Cash and settlement remain Phase 2/3.
create table public.finance_project_terms (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  project_id uuid not null,
  stream text not null check(stream in ('design','supervision')),
  revision integer not null check(revision>0),
  mode text not null check(mode in ('design','monthly','per_visit','custom','stopped')),
  amount numeric check(amount>0 and amount<=9999999999.9999),
  currency text not null references public.finance_currencies(code),
  effective_from date,
  effective_through date,
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(studio_id,id,project_id), unique(studio_id,project_id,stream,revision),
  foreign key(project_id,studio_id) references public.projects(id,studio_id) on delete restrict,
  check((stream='design' and mode='design' and amount is not null and effective_from is null and effective_through is null)
    or (stream='supervision' and mode<>'design' and effective_from is not null
      and (effective_through is null or effective_through>=effective_from)
      and (mode in ('custom','stopped') or amount is not null))),
  check(mode<>'monthly' or (extract(day from effective_from)=1 and
    (effective_through is null or effective_through=(date_trunc('month',effective_through)+interval '1 month - 1 day')::date)))
);
create index finance_project_terms_creator_idx on public.finance_project_terms(created_by);

create table public.finance_project_items (
  studio_id uuid not null,
  expected_item_id uuid not null,
  project_id uuid not null,
  stream text not null check(stream in ('design','supervision','contractor_bonus','other')),
  terms_id uuid,
  source text not null default 'manual' check(source in ('manual','monthly','visit')),
  period_start date,
  visit_id uuid references public.calendar_events(id) on delete restrict,
  contractor_id uuid references public.contractors(id) on delete restrict,
  context_label text not null default '',
  extra_visit boolean not null default false,
  primary key(studio_id,expected_item_id),
  foreign key(studio_id,expected_item_id) references public.finance_expected_items(studio_id,id) on delete restrict,
  foreign key(project_id,studio_id) references public.projects(id,studio_id) on delete restrict,
  foreign key(studio_id,terms_id,project_id) references public.finance_project_terms(studio_id,id,project_id) on delete restrict,
  check((source='monthly')=(period_start is not null)),
  check((source='visit')=(visit_id is not null)),
  check(source='manual' or stream='supervision'),
  check(contractor_id is null or stream='contractor_bonus'),
  check(not extra_visit or source='visit')
);
create index finance_project_items_project_idx on public.finance_project_items(studio_id,project_id,stream);
create index finance_project_items_terms_idx on public.finance_project_items(studio_id,terms_id,project_id);
create index finance_project_items_contractor_idx on public.finance_project_items(contractor_id);
-- Stable occurrence identities survive rate revisions, cancellations, and retries.
create unique index finance_project_month_once on public.finance_project_items(studio_id,project_id,period_start) where source='monthly';
create unique index finance_project_visit_once on public.finance_project_items(visit_id) where visit_id is not null;

alter table public.finance_project_terms enable row level security;
alter table public.finance_project_items enable row level security;
revoke all on public.finance_project_terms,public.finance_project_items from public,anon,authenticated,service_role;
grant select on public.finance_project_terms,public.finance_project_items to authenticated;
create policy finance_project_terms_admin on public.finance_project_terms for select to authenticated using((select private.is_finance_admin(studio_id)));
create policy finance_project_items_admin on public.finance_project_items for select to authenticated using((select private.is_finance_admin(studio_id)));
create trigger finance_project_terms_immutable before update or delete on public.finance_project_terms for each row execute function private.reject_finance_history_change();
create trigger finance_project_items_immutable before update or delete on public.finance_project_items for each row execute function private.reject_finance_history_change();

create view public.finance_project_expected_balances with(security_invoker=true) as
select b.*,l.project_id,l.stream,l.source,l.period_start,l.visit_id,l.contractor_id,l.context_label
from public.finance_expected_balances b join public.finance_project_items l on l.studio_id=b.studio_id and l.expected_item_id=b.id;

create view public.finance_project_current_terms with(security_invoker=true) as
select distinct on(studio_id,project_id,stream) * from public.finance_project_terms order by studio_id,project_id,stream,revision desc;

-- Exact numeric aggregation; never sum different currencies or invent forecast dates.
create view public.finance_project_totals with(security_invoker=true) as
with amounts as (
  select studio_id,project_id,stream,currency,
    sum(case when commitment<>'cancelled' then amount else 0 end) as scheduled_amount,
    sum(settled_amount) as collected_amount,sum(outstanding_amount) as outstanding_amount,
    sum(case when commitment<>'cancelled' then remaining_amount-outstanding_amount else 0 end) as planned_amount
  from public.finance_project_expected_balances group by studio_id,project_id,stream,currency
), contracts as (select * from public.finance_project_current_terms where stream='design')
select coalesce(a.studio_id,c.studio_id) as studio_id,coalesce(a.project_id,c.project_id) as project_id,
  coalesce(a.stream,'design') as stream,coalesce(a.currency,c.currency) as currency,c.amount as contract_amount,
  coalesce(a.scheduled_amount,0) as scheduled_amount,coalesce(a.collected_amount,0) as collected_amount,
  coalesce(a.outstanding_amount,0) as outstanding_amount,coalesce(a.planned_amount,0) as planned_amount,
  case when c.id is not null then c.amount-coalesce(a.scheduled_amount,0) end as unscheduled_amount
from amounts a full join contracts c on c.studio_id=a.studio_id and c.project_id=a.project_id and a.stream='design' and c.currency=a.currency;
revoke all on public.finance_project_expected_balances,public.finance_project_current_terms,public.finance_project_totals from public,anon,authenticated,service_role;
grant select on public.finance_project_expected_balances,public.finance_project_current_terms,public.finance_project_totals to authenticated;

create function public.save_finance_project_terms(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_terms','project',p_project_id,'input',p_input);
  result uuid; old public.finance_project_terms; value numeric; digits integer; scheduled numeric; start_date date;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where id=p_project_id and studio_id=p_studio_id)
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_project_invalid'; end if;
  select * into old from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=p_input->>'stream';
  if coalesce(old.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  value:=nullif(p_input->>'amount','')::numeric; start_date:=nullif(p_input->>'effectiveFrom','')::date;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null or (value is not null and (value<=0 or value>9999999999.9999 or value<>round(value,digits))) then raise exception 'finance_amount_invalid'; end if;
  if p_input->>'stream'='design' then
    if exists(select 1 from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and stream='design') and old.currency is distinct from p_input->>'currency' then raise exception 'finance_project_currency_locked'; end if;
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=p_studio_id and project_id=p_project_id and stream='design' and commitment<>'cancelled';
    if value<scheduled then raise exception 'finance_project_over_scheduled'; end if;
  else
    if old.id is not null and start_date<=old.effective_from then raise exception 'finance_supervision_effective_date'; end if;
    if exists(select 1 from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and source='monthly'
      and (period_start+interval '1 month')::date>start_date) then raise exception 'finance_supervision_generated_period'; end if;
  end if;
  insert into public.finance_project_terms(studio_id,project_id,stream,revision,mode,amount,currency,effective_from,effective_through,reason,created_by)
  values(p_studio_id,p_project_id,p_input->>'stream',coalesce(old.revision,0)+1,p_input->>'mode',value,p_input->>'currency',start_date,
    nullif(p_input->>'effectiveThrough','')::date,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

-- Runs also for edits from global Finance, preventing a bypass of project invariants.
create function private.guard_finance_project_expected() returns trigger
language plpgsql security definer set search_path='' as $$
declare link public.finance_project_items; terms public.finance_project_terms; scheduled numeric;
begin
  select * into link from public.finance_project_items where studio_id=old.studio_id and expected_item_id=old.id;
  if not found then return new; end if;
  if new.direction<>'incoming' then raise exception 'finance_project_income_required'; end if;
  if exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
    and row(new.amount,new.currency,new.direction,new.category_id,new.due_date,new.commitment,new.certainty)
      is distinct from row(old.amount,old.currency,old.direction,old.category_id,old.due_date,old.commitment,old.certainty)
    then raise exception 'finance_project_settled_terms_locked'; end if;
  if link.stream='design' then
    select * into terms from public.finance_project_current_terms where studio_id=old.studio_id and project_id=link.project_id and stream='design';
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=old.studio_id and project_id=link.project_id and stream='design' and commitment<>'cancelled' and id<>old.id;
    if new.currency<>terms.currency then raise exception 'finance_project_currency_locked'; end if;
    if scheduled+(case when new.commitment='cancelled' then 0 else new.amount end)>terms.amount then raise exception 'finance_project_over_scheduled'; end if;
  end if;
  return new;
end;
$$;
create trigger finance_project_expected_guard before update on public.finance_expected_items for each row execute function private.guard_finance_project_expected();

create function public.save_finance_project_item(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_item','project',p_project_id,'input',p_input);
  result uuid; item_id uuid; terms public.finance_project_terms; link public.finance_project_items;
  visit public.calendar_events; contractor_name text; contractor_studio uuid; scheduled numeric;
  v_stream text:=p_input->>'stream'; source text:=coalesce(p_input->>'source','manual'); item jsonb:=p_input->'item';
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id) then raise exception 'finance_project_invalid'; end if;
  if item->>'direction' is distinct from 'incoming' then raise exception 'finance_project_income_required'; end if;
  item_id:=nullif(item->>'id','')::uuid;
  if item_id is not null then
    select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=item_id and project_id=p_project_id;
    if not found then raise exception 'finance_project_invalid'; end if;
    -- Source identities are permanent, including after a refund/cancellation.
    if v_stream is distinct from link.stream then raise exception 'finance_project_context_locked'; end if;
  else
    if source not in ('manual','visit') then raise exception 'finance_project_source_invalid'; end if;
    select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=v_stream;
    if v_stream='design' then
      if terms.id is null then raise exception 'finance_project_agreement_required'; end if;
      if terms.currency is distinct from item->>'currency' then raise exception 'finance_project_currency_locked'; end if;
      select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=p_studio_id and project_id=p_project_id and finance_project_expected_balances.stream='design' and commitment<>'cancelled';
      if scheduled+(case when item->>'commitment'='cancelled' then 0 else (item->>'amount')::numeric end)>terms.amount then raise exception 'finance_project_over_scheduled'; end if;
    end if;
    if source='visit' then
      select * into visit from public.calendar_events where id=(p_input->>'visitId')::uuid and studio_id=p_studio_id and project_id=p_project_id and event_type='site_visit' and cancelled_at is null for share;
      if not found or v_stream<>'supervision' then raise exception 'finance_project_visit_invalid'; end if;
      -- Select the terms that actually apply to the visit, not today's rate.
      select * into terms from public.finance_project_terms where studio_id=p_studio_id and project_id=p_project_id and finance_project_terms.stream='supervision'
        and effective_from<=(visit.starts_at at time zone 'Europe/Kyiv')::date order by effective_from desc,revision desc limit 1;
      if terms.id is null or terms.mode not in ('per_visit','monthly') or (terms.effective_through is not null and terms.effective_through<(visit.starts_at at time zone 'Europe/Kyiv')::date)
        or (terms.mode='monthly' and not coalesce((p_input->>'extraVisit')::boolean,false)) then raise exception 'finance_project_visit_not_billable'; end if;
    end if;
    if nullif(p_input->>'contractorId','') is not null then
      select c.name,g.studio_id into contractor_name,contractor_studio from public.contractors c join public.contractor_categories g on g.id=c.category_id where c.id=(p_input->>'contractorId')::uuid for share of c;
      if contractor_studio is distinct from p_studio_id or v_stream<>'contractor_bonus' then raise exception 'finance_project_contractor_invalid'; end if;
    end if;
  end if;
  result:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),item);
  if item_id is null then
    insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,visit_id,contractor_id,context_label,extra_visit)
    values(p_studio_id,result,p_project_id,v_stream,terms.id,source,visit.id,nullif(p_input->>'contractorId','')::uuid,
      coalesce(contractor_name,case when visit.id is not null then visit.title||' · '||(visit.starts_at at time zone 'Europe/Kyiv')::date::text end,''),coalesce((p_input->>'extraVisit')::boolean,false));
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

create function public.generate_finance_supervision_months(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_from date,p_through date) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','supervision_months','project',p_project_id,'from',p_from,'through',p_through);
  result uuid; month_start date; terms public.finance_project_terms; category uuid; item uuid;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if p_from is null or p_through is null or extract(day from p_from)<>1 or extract(day from p_through)<>1 or p_through<p_from or p_through>=p_from+interval '12 months' then raise exception 'finance_supervision_range_invalid'; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id) then raise exception 'finance_project_invalid'; end if;
  select id into category from public.finance_categories where studio_id=p_studio_id and default_key='supervision' and archived_at is null;
  if category is null then raise exception 'finance_category_invalid'; end if;
  for month_start in select generate_series(p_from::timestamp,p_through::timestamp,interval '1 month')::date loop
    select * into terms from public.finance_project_terms where studio_id=p_studio_id and project_id=p_project_id and stream='supervision' and effective_from<=month_start order by effective_from desc,revision desc limit 1;
    if terms.id is null or terms.mode<>'monthly' or (terms.effective_through is not null and month_start>terms.effective_through) then raise exception 'finance_supervision_range_invalid'; end if;
    if not exists(select 1 from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and source='monthly' and period_start=month_start) then
      item:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_build_object('direction','incoming','amount',terms.amount,'currency',terms.currency,'categoryId',category,
        'description','Supervision · '||to_char(month_start,'YYYY-MM'),'dueDate',(month_start+interval '1 month - 1 day')::date,
        'expectedDate',(month_start+interval '1 month - 1 day')::date,'commitment','agreed','certainty','fixed','established',false));
      insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,period_start) values(p_studio_id,item,p_project_id,'supervision',terms.id,'monthly',month_start);
    end if;
  end loop;
  result:=p_project_id;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

-- Calendar can reschedule/cancel a visit; it cannot move billed context to another tenant/project/type.
create function private.guard_finance_visit_context() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if row(new.studio_id,new.project_id,new.event_type) is distinct from row(old.studio_id,old.project_id,old.event_type)
    and exists(select 1 from public.finance_project_items where visit_id=old.id) then raise exception 'finance_project_context_locked'; end if;
  return new;
end;
$$;
create trigger finance_visit_context_guard before update on public.calendar_events for each row execute function private.guard_finance_visit_context();
revoke all on function private.guard_finance_project_expected(),private.guard_finance_visit_context() from public,anon,authenticated,service_role;
revoke all on function public.save_finance_project_terms(uuid,uuid,uuid,jsonb),public.save_finance_project_item(uuid,uuid,uuid,jsonb),public.generate_finance_supervision_months(uuid,uuid,uuid,date,date) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_project_terms(uuid,uuid,uuid,jsonb),public.save_finance_project_item(uuid,uuid,uuid,jsonb),public.generate_finance_supervision_months(uuid,uuid,uuid,date,date) to authenticated;
