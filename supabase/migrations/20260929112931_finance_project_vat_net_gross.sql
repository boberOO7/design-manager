-- Project VAT is an obligation-currency snapshot. Cash and FX settlement stay gross.
alter table public.finance_project_terms
  add column vat_rate numeric,
  add column price_basis text,
  add column net_amount numeric,
  add column vat_amount numeric,
  add column gross_amount numeric;
alter table public.finance_project_terms disable trigger finance_project_terms_immutable;
update public.finance_project_terms set net_amount=amount,vat_amount=case when amount is not null then 0 end,gross_amount=amount;
alter table public.finance_project_terms enable trigger finance_project_terms_immutable;
alter table public.finance_project_terms
  add constraint finance_project_terms_vat_check check (
    (vat_rate is null and price_basis is null or vat_rate>=0 and vat_rate=round(vat_rate,4) and price_basis in ('net','gross'))
    and ((amount is null and net_amount is null and vat_amount is null and gross_amount is null)
      or (amount is not null and net_amount is not null and vat_amount is not null and gross_amount is not null
        and net_amount>=0 and vat_amount>=0 and gross_amount=net_amount+vat_amount
        and amount=case when price_basis='gross' then gross_amount else net_amount end)));

alter table public.finance_expected_items
  add column vat_rate numeric,
  add column price_basis text,
  add column net_amount numeric,
  add column vat_amount numeric;
update public.finance_expected_items set net_amount=amount,vat_amount=0;
alter table public.finance_expected_items
  alter column net_amount set not null,
  alter column vat_amount set not null,
  add constraint finance_expected_vat_check check (
    (vat_rate is null and price_basis is null or vat_rate>=0 and vat_rate=round(vat_rate,4) and price_basis in ('net','gross'))
    and net_amount>=0 and vat_amount>=0 and amount=net_amount+vat_amount
    and (vat_rate is not null or vat_amount=0));

create function private.finance_vat_parts(p_amount numeric,p_rate numeric,p_basis text,p_digits integer)
returns table(net_amount numeric,vat_amount numeric,gross_amount numeric)
language sql immutable set search_path='' as $$
  select case when p_rate is null or p_basis='net' then p_amount else round(p_amount/(1+p_rate/100),p_digits) end,
    case when p_rate is null then 0 when p_basis='net' then round(p_amount*p_rate/100,p_digits)
      else p_amount-round(p_amount/(1+p_rate/100),p_digits) end,
    case when p_rate is null then p_amount when p_basis='net' then p_amount+round(p_amount*p_rate/100,p_digits) else p_amount end
$$;
revoke all on function private.finance_vat_parts(numeric,numeric,text,integer) from public,anon,authenticated,service_role;

-- Ordinary Expected edits retain their stored rate. Project RPCs can provide an
-- exact new composition before settlement; allocation history freezes it.
create function private.set_finance_expected_vat() returns trigger
language plpgsql security definer set search_path='' as $$
declare digits integer; parts record;
begin
  select minor_units into digits from public.finance_currencies where code=new.currency;
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  if tg_op='UPDATE' and exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
    and row(new.amount,new.currency,new.vat_rate,new.price_basis,new.net_amount,new.vat_amount)
      is distinct from row(old.amount,old.currency,old.vat_rate,old.price_basis,old.net_amount,old.vat_amount)
    then raise exception 'finance_project_settled_terms_locked'; end if;
  if new.vat_rate is null then
    new.price_basis:=null; new.net_amount:=new.amount; new.vat_amount:=0;
  elsif new.vat_rate<0 or new.vat_rate<>round(new.vat_rate,4) or new.price_basis not in ('net','gross') then
    raise exception 'finance_project_vat_invalid';
  elsif tg_op='INSERT' or (new.net_amount,new.vat_amount) is not distinct from (old.net_amount,old.vat_amount) then
    select * into parts from private.finance_vat_parts(new.amount,new.vat_rate,'gross',digits);
    new.net_amount:=parts.net_amount; new.vat_amount:=parts.vat_amount;
  elsif new.net_amount+new.vat_amount<>new.amount
    or new.vat_amount<>round(new.net_amount*new.vat_rate/100,digits)
      and new.net_amount<>round(new.amount/(1+new.vat_rate/100),digits) then
    raise exception 'finance_project_vat_invalid';
  end if;
  return new;
end;
$$;
revoke all on function private.set_finance_expected_vat() from public,anon,authenticated,service_role;
create trigger finance_expected_vat before insert or update on public.finance_expected_items
for each row execute function private.set_finance_expected_vat();

alter table public.finance_allocations
  add column net_amount numeric,
  add column vat_amount numeric;
update public.finance_allocations set net_amount=amount,vat_amount=0;
alter table public.finance_allocations
  alter column net_amount set not null,
  alter column vat_amount set not null,
  add constraint finance_allocation_vat_check check (amount=net_amount+vat_amount);
create function private.set_finance_allocation_vat() returns trigger
language plpgsql security definer set search_path='' as $$
declare expected public.finance_expected_items; original public.finance_allocations; digits integer;
begin
  select * into expected from public.finance_expected_items where studio_id=new.studio_id and id=new.expected_item_id;
  select minor_units into digits from public.finance_currencies where code=expected.currency;
  if new.released_allocation_id is not null then
    select * into original from public.finance_allocations where studio_id=new.studio_id and id=new.released_allocation_id;
    new.net_amount:=case when -new.amount=original.amount then -original.net_amount
      else -round(original.net_amount*(-new.amount)/original.amount,digits) end;
  else
    new.net_amount:=case when new.amount=expected.amount then expected.net_amount
      else round(expected.net_amount*new.amount/expected.amount,digits) end;
  end if;
  new.vat_amount:=new.amount-new.net_amount;
  return new;
end;
$$;
revoke all on function private.set_finance_allocation_vat() from public,anon,authenticated,service_role;
create trigger finance_allocation_vat before insert on public.finance_allocations
for each row execute function private.set_finance_allocation_vat();

create or replace view public.finance_project_current_terms with(security_invoker=true) as
select distinct on(studio_id,project_id,stream) id,studio_id,project_id,stream,revision,mode,amount,currency,
  effective_from,effective_through,reason,created_by,created_at,vat_rate,price_basis,net_amount,vat_amount,gross_amount
from public.finance_project_terms order by studio_id,project_id,stream,revision desc;

-- Preserve existing view column order; append snapshots for Data API readers.
create or replace view public.finance_expected_balances with(security_invoker=true) as
select i.id,i.studio_id,i.direction,i.amount,i.currency,i.category_id,i.description,i.due_date,i.expected_payment_date,
  i.commitment,i.certainty,i.is_established,i.version,i.created_by,i.created_at,i.updated_at,
  coalesce(a.settled,0) as settled_amount,i.amount-coalesce(a.settled,0) as remaining_amount,
  case when coalesce(a.settled,0)=0 then 'unpaid' when a.settled=i.amount then 'settled' else 'partial' end as payment_state,
  case when i.due_date is null then 'unscheduled' when i.due_date>(now() at time zone 'Europe/Kyiv')::date then 'not_due'
    when i.due_date=(now() at time zone 'Europe/Kyiv')::date then 'due' else 'overdue' end as due_state,
  case when i.is_established and i.commitment='agreed' and i.certainty='fixed' then i.amount-coalesce(a.settled,0) else 0 end as outstanding_amount,
  i.vat_rate,i.price_basis,i.net_amount,i.vat_amount
from public.finance_expected_items i left join (
  select studio_id,expected_item_id,sum(amount) as settled from public.finance_allocations group by studio_id,expected_item_id
) a on a.studio_id=i.studio_id and a.expected_item_id=i.id;

create or replace view public.finance_project_expected_balances with(security_invoker=true) as
select b.id,b.studio_id,b.direction,b.amount,b.currency,b.category_id,b.description,b.due_date,b.expected_payment_date,
  b.commitment,b.certainty,b.is_established,b.version,b.created_by,b.created_at,b.updated_at,b.settled_amount,b.remaining_amount,
  b.payment_state,b.due_state,b.outstanding_amount,l.project_id,l.stream,l.source,l.period_start,l.visit_id,l.contractor_id,l.context_label,
  b.vat_rate,b.price_basis,b.net_amount,b.vat_amount
from public.finance_expected_balances b join public.finance_project_items l on l.studio_id=b.studio_id and l.expected_item_id=b.id;

create or replace view public.finance_project_plan_items with(security_invoker=true) as
select b.id,b.studio_id,b.direction,b.amount,b.currency,b.category_id,b.description,b.due_date,b.expected_payment_date,
  b.commitment,b.certainty,b.is_established,b.version,b.created_by,b.created_at,b.updated_at,b.settled_amount,b.remaining_amount,
  b.payment_state,b.due_state,b.outstanding_amount,b.project_id,b.stream,b.source,b.period_start,b.visit_id,b.contractor_id,b.context_label,
  exists(select 1 from public.finance_allocations a where a.studio_id=b.studio_id and a.expected_item_id=b.id) as has_settlement_history,
  b.vat_rate,b.price_basis,b.net_amount,b.vat_amount
from public.finance_project_expected_balances b where b.stream='design' and b.commitment<>'cancelled';

create or replace view public.finance_project_totals with(security_invoker=true) as
with amounts as (
  select b.studio_id,b.project_id,b.stream,b.currency,
    sum(case when b.commitment<>'cancelled' then b.amount else 0 end) as scheduled_amount,
    sum(b.settled_amount) as collected_amount,sum(b.outstanding_amount) as outstanding_amount,
    sum(case when b.commitment<>'cancelled' then b.remaining_amount-b.outstanding_amount else 0 end) as planned_amount,
    sum(case when b.commitment<>'cancelled' then b.net_amount else 0 end) as scheduled_net_amount,
    sum(case when b.commitment<>'cancelled' then b.vat_amount else 0 end) as scheduled_vat_amount,
    sum(coalesce(a.net_amount,0)) as collected_net_amount,sum(coalesce(a.vat_amount,0)) as collected_vat_amount
  from public.finance_project_expected_balances b
  left join (select studio_id,expected_item_id,sum(net_amount) net_amount,sum(vat_amount) vat_amount
    from public.finance_allocations group by studio_id,expected_item_id) a on a.studio_id=b.studio_id and a.expected_item_id=b.id
  group by b.studio_id,b.project_id,b.stream,b.currency
), contracts as (select * from public.finance_project_current_terms where stream='design')
select coalesce(a.studio_id,c.studio_id) as studio_id,coalesce(a.project_id,c.project_id) as project_id,
  coalesce(a.stream,'design') as stream,coalesce(a.currency,c.currency) as currency,c.gross_amount as contract_amount,
  coalesce(a.scheduled_amount,0) as scheduled_amount,coalesce(a.collected_amount,0) as collected_amount,
  coalesce(a.outstanding_amount,0) as outstanding_amount,coalesce(a.planned_amount,0) as planned_amount,
  case when c.id is not null then c.gross_amount-coalesce(a.scheduled_amount,0) end as unscheduled_amount,
  c.net_amount as contract_net_amount,c.vat_amount as contract_vat_amount,c.gross_amount as contract_gross_amount,
  coalesce(a.scheduled_net_amount,0) as scheduled_net_amount,coalesce(a.scheduled_vat_amount,0) as scheduled_vat_amount,
  coalesce(a.collected_net_amount,0) as collected_net_amount,coalesce(a.collected_vat_amount,0) as collected_vat_amount
from amounts a full join contracts c on c.studio_id=a.studio_id and c.project_id=a.project_id and a.stream='design' and c.currency=a.currency;

-- terms VAT boundary.
create or replace function public.save_finance_project_terms(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_terms','project',p_project_id,'input',p_input);
  result uuid; old public.finance_project_terms; value numeric; digits integer; scheduled numeric; start_date date;
  vat_rate numeric; basis text; net_value numeric; vat_value numeric; gross_value numeric;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where id=p_project_id and studio_id=p_studio_id)
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_project_invalid'; end if;
  select * into old from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=p_input->>'stream';
  if coalesce(old.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  value:=nullif(p_input->>'amount','')::numeric; start_date:=nullif(p_input->>'effectiveFrom','')::date;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null or (value is not null and (value<=0 or value>9999999999.9999 or value<>round(value,digits))) then raise exception 'finance_amount_invalid'; end if;
  vat_rate:=nullif(p_input->>'vatRate','')::numeric; basis:=nullif(p_input->>'priceBasis','');
  if (vat_rate is null)<>(basis is null) or (vat_rate is not null and (vat_rate<0 or vat_rate<>round(vat_rate,4) or basis not in ('net','gross'))) then raise exception 'finance_project_vat_invalid'; end if;
  if value is not null then
    select net_amount,vat_amount,gross_amount into net_value,vat_value,gross_value from private.finance_vat_parts(value,vat_rate,basis,digits);
    if gross_value>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  end if;
  if p_input->>'stream'='design' then
    if exists(select 1 from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and stream='design') and old.currency is distinct from p_input->>'currency' then raise exception 'finance_project_currency_locked'; end if;
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=p_studio_id and project_id=p_project_id and stream='design' and commitment<>'cancelled';
    if gross_value<scheduled then raise exception 'finance_project_over_scheduled'; end if;
  else
    if old.id is not null and start_date<=old.effective_from then raise exception 'finance_supervision_effective_date'; end if;
    if exists(select 1 from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and source='monthly'
      and (period_start+interval '1 month')::date>start_date) then raise exception 'finance_supervision_generated_period'; end if;
  end if;
  insert into public.finance_project_terms(studio_id,project_id,stream,revision,mode,amount,currency,effective_from,effective_through,reason,created_by,vat_rate,price_basis,net_amount,vat_amount,gross_amount)
  values(p_studio_id,p_project_id,p_input->>'stream',coalesce(old.revision,0)+1,p_input->>'mode',value,p_input->>'currency',start_date,
    nullif(p_input->>'effectiveThrough','')::date,btrim(p_input->>'reason'),auth.uid(),vat_rate,basis,net_value,vat_value,gross_value) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

-- guard VAT boundary.
create or replace function private.guard_finance_project_expected() returns trigger
language plpgsql security definer set search_path='' as $$
declare link public.finance_project_items; terms public.finance_project_terms; scheduled numeric;
begin
  select * into link from public.finance_project_items where studio_id=old.studio_id and expected_item_id=old.id;
  if not found then return new; end if;
  if (link.stream='expenses' and new.direction<>'outgoing')
    or (link.stream<>'expenses' and new.direction<>'incoming')
    then raise exception 'finance_project_direction_required'; end if;
  if link.stream='expenses' and (not exists(select 1 from public.finance_categories c where c.studio_id=new.studio_id
      and c.id=new.category_id and c.direction='outgoing' and c.nature='operating')
    or (new.category_id is distinct from old.category_id and not exists(
      select 1 from public.finance_categories c where c.studio_id=new.studio_id
        and c.id=new.category_id and c.project_expense_enabled)))
    then raise exception 'finance_project_expense_invalid'; end if;
  if exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
    and row(new.amount,new.currency,new.direction,new.category_id,new.due_date,new.certainty)
      is distinct from row(old.amount,old.currency,old.direction,old.category_id,old.due_date,old.certainty)
    then raise exception 'finance_project_settled_terms_locked'; end if;
  if new.commitment is distinct from old.commitment then
    if new.commitment='cancelled' then
      if exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id having sum(amount)<>0)
        or not exists(select 1 from public.finance_planning_requests where studio_id=old.studio_id
          and payload->>'operation'='project_cancellation' and payload->'input'->>'itemId'=old.id::text
          and (payload->'input'->>'version')::integer=old.version)
        then raise exception 'finance_project_cancellation_required'; end if;
    elsif old.commitment='cancelled' or exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
      then raise exception 'finance_project_settled_terms_locked'; end if;
  end if;
  if link.stream='design' then
    select * into terms from public.finance_project_current_terms where studio_id=old.studio_id and project_id=link.project_id and stream='design';
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=old.studio_id and project_id=link.project_id and stream='design' and commitment<>'cancelled' and id<>old.id;
    if new.currency<>terms.currency then raise exception 'finance_project_currency_locked'; end if;
    if scheduled+(case when new.commitment='cancelled' then 0 else new.amount end)>terms.gross_amount then raise exception 'finance_project_over_scheduled'; end if;
  end if;
  return new;
end;
$$;

-- item VAT boundary.
create or replace function public.save_finance_project_item(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_item','project',p_project_id,'input',p_input);
  result uuid; item_id uuid; terms public.finance_project_terms; link public.finance_project_items;
  visit public.calendar_events; contractor_name text; contractor_studio uuid; scheduled numeric;
  existing public.finance_expected_items; priced record; digits integer; rate numeric; basis text; gross numeric;
  v_stream text:=p_input->>'stream'; source text:=coalesce(p_input->>'source','manual'); item jsonb:=p_input->'item';
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id) then raise exception 'finance_project_invalid'; end if;
  if v_stream='expenses' then
    if item->>'direction' is distinct from 'outgoing' or source<>'manual'
      or not exists(select 1 from public.finance_categories c where c.studio_id=p_studio_id
        and c.id=(item->>'categoryId')::uuid and c.direction='outgoing' and c.nature='operating')
      or (nullif(item->>'id','') is null and not exists(
        select 1 from public.finance_categories c where c.studio_id=p_studio_id
          and c.id=(item->>'categoryId')::uuid and c.project_expense_enabled))
      then raise exception 'finance_project_expense_invalid'; end if;
  elsif item->>'direction' is distinct from 'incoming' then
    raise exception 'finance_project_income_required';
  end if;
  item_id:=nullif(item->>'id','')::uuid;
  if item_id is not null then
    select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=item_id and project_id=p_project_id;
    if not found then raise exception 'finance_project_invalid'; end if;
    select * into existing from public.finance_expected_items where studio_id=p_studio_id and id=item_id;
    if coalesce((p_input->>'useCurrentTerms')::boolean,false) then
      select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=v_stream;
    end if;
    -- Source identities are permanent, including after a refund/cancellation.
    if v_stream is distinct from link.stream then raise exception 'finance_project_context_locked'; end if;
  else
    if source not in ('manual','visit') then raise exception 'finance_project_source_invalid'; end if;
    select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=v_stream;
    if v_stream='design' then
      if terms.id is null then raise exception 'finance_project_agreement_required'; end if;
      if terms.currency is distinct from item->>'currency' then raise exception 'finance_project_currency_locked'; end if;
    end if;
    if source='visit' then
      select * into visit from public.calendar_events where id=(p_input->>'visitId')::uuid and studio_id=p_studio_id and project_id=p_project_id and event_type='site_visit' and cancelled_at is null for share;
      if not found or v_stream<>'supervision' then raise exception 'finance_project_visit_invalid'; end if;
      -- Select the terms that actually apply to the visit, not today's rate.
      select * into terms from public.finance_project_terms where studio_id=p_studio_id and project_id=p_project_id and finance_project_terms.stream='supervision'
        and effective_from<=(visit.starts_at at time zone 'Europe/Kyiv')::date order by effective_from desc,revision desc limit 1;
      if terms.id is null or terms.mode not in ('per_visit','monthly') or (terms.effective_through is not null and terms.effective_through<(visit.starts_at at time zone 'Europe/Kyiv')::date)
        or (terms.mode='monthly' and not coalesce((p_input->>'extraVisit')::boolean,false)) then raise exception 'finance_project_visit_not_billable'; end if;
      -- Contract defaults must still match the applicable revision at submission.
      -- Explicit manual prices remain supported and are recorded in the request.
      if p_input->>'visitPricing'='contract' and (terms.mode<>'per_visit'
        or terms.id is distinct from nullif(p_input->>'visitTermsId','')::uuid
        or terms.amount is distinct from (item->>'amount')::numeric or terms.currency is distinct from item->>'currency')
        then raise exception 'finance_project_visit_price_changed'; end if;
    end if;
    if nullif(p_input->>'contractorId','') is not null then
      select c.name,g.studio_id into contractor_name,contractor_studio from public.contractors c join public.contractor_categories g on g.id=c.category_id where c.id=(p_input->>'contractorId')::uuid for share of c;
      if contractor_studio is distinct from p_studio_id or v_stream<>'contractor_bonus' then raise exception 'finance_project_contractor_invalid'; end if;
    end if;
  end if;
  select minor_units into digits from public.finance_currencies where code=item->>'currency';
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  rate:=case when item_id is not null and not coalesce((p_input->>'useCurrentTerms')::boolean,false) then existing.vat_rate else terms.vat_rate end;
  basis:=case when item_id is not null and not coalesce((p_input->>'useCurrentTerms')::boolean,false) then existing.price_basis else terms.price_basis end;
  select * into priced from private.finance_vat_parts((item->>'amount')::numeric,rate,
    case when coalesce((p_input->>'useAgreementBasis')::boolean,false) then basis else 'gross' end,digits);
  gross:=priced.gross_amount;
  if gross is null or gross<=0 or gross>9999999999.9999 or gross<>round(gross,digits) then raise exception 'finance_amount_invalid'; end if;
  if item_id is null and v_stream='design' then
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances
      where studio_id=p_studio_id and project_id=p_project_id and stream='design' and commitment<>'cancelled';
    if scheduled+(case when item->>'commitment'='cancelled' then 0 else gross end)>terms.gross_amount then raise exception 'finance_project_over_scheduled'; end if;
  end if;
  result:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_set(item,'{amount}',to_jsonb(gross),true));
  update public.finance_expected_items set vat_rate=rate,price_basis=basis,net_amount=priced.net_amount,vat_amount=priced.vat_amount
    where studio_id=p_studio_id and id=result;
  if item_id is null then
    insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,visit_id,contractor_id,context_label,extra_visit)
    values(p_studio_id,result,p_project_id,v_stream,terms.id,source,visit.id,nullif(p_input->>'contractorId','')::uuid,
      coalesce(contractor_name,case when visit.id is not null then visit.title||' · '||(visit.starts_at at time zone 'Europe/Kyiv')::date::text end,''),coalesce((p_input->>'extraVisit')::boolean,false));
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

-- plan VAT boundary.
create or replace function public.save_finance_project_plan(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  payload jsonb:=jsonb_build_object('operation','project_plan','project',p_project_id,'input',p_input);
  result uuid; current_terms public.finance_project_terms; old public.finance_project_plan_items;
  row_input jsonb; item_input jsonb; prepared jsonb:='[]'; known jsonb; supplied_known jsonb;
  total numeric; gross_total numeric; protected numeric; scheduled numeric:=0; digits integer; area numeric; rate numeric;
  vat_rate numeric; basis text; priced record;
  item_id uuid; category_id uuid; ordered uuid[]:='{}'; reason text:=btrim(p_input->>'reason');
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id)
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null)
    then raise exception 'finance_project_invalid'; end if;
  select * into current_terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream='design';
  if coalesce(current_terms.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  if reason is null or char_length(reason) not between 1 and 2000
    or p_input->>'pricingMethod' is null or p_input->>'pricingMethod' not in ('fixed','area')
    or jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_typeof(p_input->'known') is distinct from 'array'
    then raise exception 'finance_input_invalid'; end if;
  total:=(p_input->>'amount')::numeric;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if total is null or digits is null or not(total>0 and total<=9999999999.9999) or total<>round(total,digits) then raise exception 'finance_amount_invalid'; end if;
  vat_rate:=nullif(p_input->>'vatRate','')::numeric; basis:=nullif(p_input->>'priceBasis','');
  if (vat_rate is null)<>(basis is null) or (vat_rate is not null and (vat_rate<0 or vat_rate<>round(vat_rate,4) or basis not in ('net','gross'))) then raise exception 'finance_project_vat_invalid'; end if;
  select gross_amount into gross_total from private.finance_vat_parts(total,vat_rate,basis,digits);
  if gross_total>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  if p_input->>'pricingMethod'='area' then
    area:=(p_input->>'area')::numeric; rate:=(p_input->>'rate')::numeric;
    if area is null or rate is null or not(area>0 and area<=9999999999.9999 and rate>0 and rate<=9999999999.9999)
      or area<>round(area,4) or rate<>round(rate,4) or total<>round(area*rate,digits) then raise exception 'finance_amount_invalid'; end if;
  end if;
  -- Full active-list concurrency check includes history, including fully released matches.
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'protected',has_settlement_history) order by id),'[]'),
    coalesce(sum(amount) filter(where has_settlement_history),0)
    into known,protected from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]') into supplied_known from jsonb_array_elements(p_input->'known');
  if known is distinct from supplied_known then raise exception 'finance_version_conflict'; end if;
  if exists(select 1 from jsonb_array_elements(p_input->'items') x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1)
    then raise exception 'finance_input_invalid'; end if;
  select id into category_id from public.finance_categories where studio_id=p_studio_id and default_key='project_payments' and archived_at is null;
  for row_input in select value from jsonb_array_elements(p_input->'items') loop
    item_id:=nullif(row_input->>'id','')::uuid;
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and id=item_id;
    if item_id is not null and old.id is null then raise exception 'finance_project_invalid'; end if;
    if old.has_settlement_history then raise exception 'finance_project_settled_terms_locked'; end if;
    if row_input->>'name' is null or char_length(btrim(row_input->>'name')) not between 1 and 2000
      or (row_input->>'amount')::numeric is null or not((row_input->>'amount')::numeric>0 and (row_input->>'amount')::numeric<=9999999999.9999)
      or (row_input->>'amount')::numeric<>round((row_input->>'amount')::numeric,digits) then raise exception 'finance_amount_invalid'; end if;
    select * into priced from private.finance_vat_parts((row_input->>'amount')::numeric,vat_rate,basis,digits);
    scheduled:=scheduled+priced.gross_amount;
    item_input:=jsonb_build_object('id',item_id,'version',old.version,'direction','incoming','amount',row_input->>'amount','gross',priced.gross_amount,'currency',p_input->>'currency',
      'categoryId',coalesce(old.category_id,category_id),'description',btrim(row_input->>'name'),'dueDate',nullif(row_input->>'dueDate','')::date,
      'expectedDate',nullif(row_input->>'expectedDate','')::date,'commitment',coalesce(old.commitment,'agreed'),'certainty',coalesce(old.certainty,'fixed'),
      'established',coalesce(old.is_established,nullif(row_input->>'dueDate','')::date<=(now() at time zone 'Europe/Kyiv')::date,false));
    prepared:=prepared||jsonb_build_array(item_input);
  end loop;
  if protected+scheduled>gross_total then raise exception 'finance_project_over_scheduled'; end if;
  if protected+scheduled<gross_total and not coalesce((p_input->>'allowUnscheduled')::boolean,false) then raise exception 'finance_project_plan_remainder'; end if;
  -- Close removed unpaid items via the existing reasoned cancellation boundary.
  for old in select * from public.finance_project_plan_items b where studio_id=p_studio_id and project_id=p_project_id and not has_settlement_history
    and not exists(select 1 from jsonb_array_elements(prepared) i where nullif(i->>'id','')::uuid=b.id)
  loop
    perform public.cancel_finance_project_expectation(p_studio_id,gen_random_uuid(),jsonb_build_object('itemId',old.id,'version',old.version,'settledAmount','0','reason',reason));
  end loop;
  -- Reductions first keep the existing per-item contract ceiling valid throughout.
  for item_input in select value from jsonb_array_elements(prepared) loop
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=nullif(item_input->>'id','')::uuid;
    if old.id is not null and (item_input->>'gross')::numeric<old.amount then
      perform public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('stream','design','item',jsonb_set(item_input,'{amount}',item_input->'gross',true)));
    end if;
  end loop;
  result:=public.save_finance_project_terms(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('stream','design','mode','design','revision',coalesce(current_terms.revision,0),'amount',total,'currency',p_input->>'currency','vatRate',vat_rate,'priceBasis',basis,'reason',reason));
  for item_input in select value from jsonb_array_elements(prepared) loop
    item_id:=nullif(item_input->>'id','')::uuid;
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=item_id;
    -- Reduced rows get this revision's VAT snapshot after the agreement changes.
    if old.id is not null then item_input:=jsonb_set(item_input,'{version}',to_jsonb(old.version),true); end if;
    item_id:=public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,
      jsonb_build_object('stream','design','source','manual','useAgreementBasis',true,'useCurrentTerms',true,'item',item_input));
    ordered:=array_append(ordered,item_id);
  end loop;
  insert into public.finance_project_plan_revisions(terms_id,studio_id,project_id,pricing_method,area_snapshot,rate_per_m2,item_order)
    values(result,p_studio_id,p_project_id,p_input->>'pricingMethod',area,rate,ordered);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

-- months VAT boundary.
create or replace function public.generate_finance_supervision_months(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_from date,p_through date) returns uuid
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
      item:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_build_object('direction','incoming','amount',terms.gross_amount,'currency',terms.currency,'categoryId',category,
        'description','Supervision · '||to_char(month_start,'YYYY-MM'),'dueDate',(month_start+interval '1 month - 1 day')::date,
        'expectedDate',(month_start+interval '1 month - 1 day')::date,'commitment','agreed','certainty','fixed','established',false));
      update public.finance_expected_items set vat_rate=terms.vat_rate,price_basis=terms.price_basis,
        net_amount=terms.net_amount,vat_amount=terms.vat_amount where studio_id=p_studio_id and id=item;
      insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,period_start) values(p_studio_id,item,p_project_id,'supervision',terms.id,'monthly',month_start);
    end if;
  end loop;
  result:=p_project_id;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

-- cancel VAT boundary.
create or replace function public.cancel_finance_project_expectation(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_cancellation','input',p_input);
  result uuid; original public.finance_expected_items; link public.finance_project_items;
  paid numeric; retained_net numeric; digits integer; allocations jsonb; allocation jsonb; reason text:=btrim(p_input->>'reason');
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if reason is null or char_length(reason) not between 1 and 2000 then raise exception 'finance_project_reason_required'; end if;
  select * into original from public.finance_expected_items where studio_id=p_studio_id and id=(p_input->>'itemId')::uuid;
  select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=original.id;
  if link.expected_item_id is null or original.commitment='cancelled' then raise exception 'finance_project_invalid'; end if;
  select coalesce(sum(amount),0) into paid from public.finance_allocations where studio_id=p_studio_id and expected_item_id=original.id;
  if original.version is distinct from (p_input->>'version')::integer or paid is distinct from (p_input->>'settledAmount')::numeric
    then raise exception 'finance_version_conflict'; end if;
  if paid>0 and not coalesce((p_input->>'retainSettlement')::boolean,false) then raise exception 'finance_project_retention_required'; end if;
  result:=case when paid>0 then gen_random_uuid() else original.id end;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'movement',a.movement_id,'amount',a.amount+coalesce(r.amount,0))),'[]') into allocations
    from public.finance_allocations a
    left join lateral (select sum(amount) amount from public.finance_allocations where studio_id=p_studio_id and released_allocation_id=a.id) r on true
    where a.studio_id=p_studio_id and a.expected_item_id=original.id and a.amount>0 and a.amount+coalesce(r.amount,0)>0;
  for allocation in select value from jsonb_array_elements(allocations) loop
    perform public.release_finance_allocation(p_studio_id,gen_random_uuid(),(allocation->>'id')::uuid,reason);
  end loop;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  update public.finance_expected_items set commitment='cancelled',is_established=false,version=version+1,updated_at=now() where id=original.id and studio_id=p_studio_id;
  if paid>0 then
    select minor_units into digits from public.finance_currencies where code=original.currency;
    retained_net:=case when paid=original.amount then original.net_amount else round(original.net_amount*paid/original.amount,digits) end;
    -- Preserve the original category even if it has since been archived.
    insert into public.finance_expected_items(id,studio_id,direction,amount,currency,category_id,description,due_date,expected_payment_date,commitment,certainty,is_established,created_by)
      values(result,p_studio_id,original.direction,paid,original.currency,original.category_id,original.description,original.due_date,original.expected_payment_date,'agreed','fixed',original.is_established,auth.uid());
    update public.finance_expected_items set vat_rate=original.vat_rate,price_basis=original.price_basis,
      net_amount=retained_net,vat_amount=paid-retained_net where studio_id=p_studio_id and id=result;
    -- Visit/month source identities remain permanently reserved on the original.
    insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,contractor_id,context_label)
      values(p_studio_id,result,link.project_id,link.stream,link.terms_id,'manual',link.contractor_id,link.context_label);
    for allocation in select value from jsonb_array_elements(allocations) loop
      perform public.allocate_finance_payment(p_studio_id,gen_random_uuid(),result,(allocation->>'movement')::uuid,(allocation->>'amount')::numeric);
    end loop;
  end if;
  return result;
end;
$$;
