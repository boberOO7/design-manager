-- Commercial orders are identities, not another finance ledger.
-- Preflight rejects orphan commercial history rather than inferring acceptance.
do $preflight$
begin
  if exists(select 1 from public.finance_project_items i left join public.finance_project_terms t
      on t.studio_id=i.studio_id and t.id=i.terms_id and t.project_id=i.project_id
      where i.stream='design' and (t.id is null or t.stream<>'design'))
    or exists(select 1 from public.finance_project_proposals p where not exists(
      select 1 from public.finance_project_terms t where t.studio_id=p.studio_id and t.project_id=p.project_id and t.stream='design'))
    then raise exception 'finance_order_backfill_orphan_history'; end if;
end $preflight$;

create table public.finance_project_orders (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  project_id uuid not null,
  name text not null check(char_length(btrim(name)) between 1 and 2000),
  is_default boolean not null default false,
  status text not null default 'draft' check(status in ('draft','confirmed','discarded')),
  draft_plan jsonb check(draft_plan is null or jsonb_typeof(draft_plan)='object'),
  version integer not null default 1 check(version>0),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  discarded_at timestamptz,
  unique(studio_id,id,project_id),
  foreign key(project_id,studio_id) references public.projects(id,studio_id) on delete restrict,
  check((status='confirmed')=(confirmed_at is not null)),
  check((status='discarded')=(discarded_at is not null))
);
create unique index finance_project_default_order_idx on public.finance_project_orders(studio_id,project_id)
  where is_default and status<>'discarded';
create index finance_project_orders_project_idx on public.finance_project_orders(studio_id,project_id,status,created_at,id);
create index finance_project_orders_creator_idx on public.finance_project_orders(created_by);
create index finance_project_orders_updater_idx on public.finance_project_orders(updated_by);
alter table public.finance_project_orders enable row level security;
revoke all on public.finance_project_orders from public,anon,authenticated,service_role;
grant select on public.finance_project_orders to authenticated;
create policy finance_project_orders_admin on public.finance_project_orders for select to authenticated
  using((select private.is_finance_admin(studio_id)));

alter table public.finance_project_terms add column order_id uuid;
alter table public.finance_project_items add column order_id uuid;
alter table public.finance_project_proposals add column order_id uuid;
insert into public.finance_project_orders(studio_id,project_id,name,is_default,status,created_by,updated_by,created_at,updated_at,confirmed_at)
select distinct on(studio_id,project_id) studio_id,project_id,'Основне замовлення',true,'confirmed',created_by,created_by,created_at,created_at,created_at
from public.finance_project_terms where stream='design' order by studio_id,project_id,revision;
alter table public.finance_project_terms disable trigger finance_project_terms_immutable;
alter table public.finance_project_items disable trigger finance_project_items_immutable;
alter table public.finance_project_proposals disable trigger finance_proposal_immutable;
update public.finance_project_terms t set order_id=o.id from public.finance_project_orders o
  where t.studio_id=o.studio_id and t.project_id=o.project_id and t.stream='design';
update public.finance_project_items i set order_id=t.order_id from public.finance_project_terms t
  where i.studio_id=t.studio_id and i.terms_id=t.id and i.stream='design';
update public.finance_project_proposals p set order_id=o.id from public.finance_project_orders o
  where p.studio_id=o.studio_id and p.project_id=o.project_id;
alter table public.finance_project_terms enable trigger finance_project_terms_immutable;
alter table public.finance_project_items enable trigger finance_project_items_immutable;
alter table public.finance_project_proposals enable trigger finance_proposal_immutable;
alter table public.finance_project_terms drop constraint finance_project_terms_studio_id_project_id_stream_revision_key;
create unique index finance_project_order_terms_revision_idx on public.finance_project_terms(studio_id,order_id,revision) where stream='design';
create unique index finance_project_supervision_terms_revision_idx on public.finance_project_terms(studio_id,project_id,revision) where stream='supervision';
alter table public.finance_project_terms add constraint finance_project_terms_order_fk
  foreign key(studio_id,order_id,project_id) references public.finance_project_orders(studio_id,id,project_id) on delete restrict,
  add constraint finance_project_terms_order_stream check((stream='design')=(order_id is not null));
alter table public.finance_project_terms add constraint finance_project_terms_order_identity unique(studio_id,id,project_id,order_id);
alter table public.finance_project_items add constraint finance_project_items_order_fk
  foreign key(studio_id,order_id,project_id) references public.finance_project_orders(studio_id,id,project_id) on delete restrict,
  add constraint finance_project_items_terms_order_fk foreign key(studio_id,terms_id,project_id,order_id)
    references public.finance_project_terms(studio_id,id,project_id,order_id) on delete restrict,
  add constraint finance_project_items_order_stream check((stream='design')=(order_id is not null) and (stream<>'design' or terms_id is not null));
alter table public.finance_project_proposals alter column order_id set not null;
alter table public.finance_project_proposals add constraint finance_project_proposals_order_fk
  foreign key(studio_id,order_id,project_id) references public.finance_project_orders(studio_id,id,project_id) on delete restrict;
create index finance_project_items_order_idx on public.finance_project_items(studio_id,order_id,expected_item_id);
create index finance_project_proposals_order_idx on public.finance_project_proposals(studio_id,order_id,revision);

-- Existing legacy writes can establish only the initial/default confirmed order.
create function private.resolve_finance_project_order(p_studio uuid,p_project uuid,p_order uuid,p_create boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare result public.finance_project_orders;
begin
  if p_order is null then
    select * into result from public.finance_project_orders where studio_id=p_studio and project_id=p_project and is_default and status<>'discarded';
    if result.id is null and p_create then
      insert into public.finance_project_orders(studio_id,project_id,name,is_default,status,created_by,updated_by,confirmed_at)
      values(p_studio,p_project,'Основне замовлення',true,'confirmed',auth.uid(),auth.uid(),now()) returning * into result;
    end if;
  else select * into result from public.finance_project_orders where studio_id=p_studio and project_id=p_project and id=p_order; end if;
  if result.id is null and p_order is null then raise exception 'finance_project_agreement_required'; end if;
  if result.id is null or result.status<>'confirmed' then raise exception 'finance_project_order_unconfirmed'; end if;
  return result.id;
end $$;
revoke all on function private.resolve_finance_project_order(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function private.guard_finance_project_order_history() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or row(new.id,new.studio_id,new.project_id,new.created_by,new.created_at,new.is_default)
      is distinct from row(old.id,old.studio_id,old.project_id,old.created_by,old.created_at,old.is_default)
    or old.status='discarded' or (old.status='confirmed' and new.status<>'confirmed')
    then raise exception 'finance_project_order_history_locked'; end if;
  return new;
end $$;
create trigger finance_project_order_history before update or delete on public.finance_project_orders
for each row execute function private.guard_finance_project_order_history();
revoke all on function private.guard_finance_project_order_history() from public,anon,authenticated,service_role;

-- Defense in depth: draft/discarded parents never own canonical finance rows.
create function private.guard_finance_project_order_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.order_id is not null and not exists(select 1 from public.finance_project_orders o
    where o.studio_id=new.studio_id and o.project_id=new.project_id and o.id=new.order_id and o.status='confirmed')
    then raise exception 'finance_project_order_unconfirmed'; end if;
  return new;
end $$;
create trigger finance_project_terms_confirmed_order before insert on public.finance_project_terms
  for each row execute function private.guard_finance_project_order_link();
create trigger finance_project_items_confirmed_order before insert on public.finance_project_items
  for each row execute function private.guard_finance_project_order_link();
revoke all on function private.guard_finance_project_order_link() from public,anon,authenticated,service_role;

create or replace view public.finance_project_current_terms with(security_invoker=true) as
select distinct on(studio_id,project_id,stream,order_id) id,studio_id,project_id,stream,revision,mode,amount,currency,
  effective_from,effective_through,reason,created_by,created_at,vat_rate,price_basis,net_amount,vat_amount,gross_amount,revenue_tax_rate,
  discount_type,discount_value,discount_amount,order_id
from public.finance_project_terms order by studio_id,project_id,stream,order_id,revision desc;

create or replace view public.finance_project_expected_balances with(security_invoker=true) as
select b.id,b.studio_id,b.direction,b.amount,b.currency,b.category_id,b.description,b.due_date,b.expected_payment_date,
  b.commitment,b.certainty,b.is_established,b.version,b.created_by,b.created_at,b.updated_at,b.settled_amount,b.remaining_amount,
  b.payment_state,b.due_state,b.outstanding_amount,l.project_id,l.stream,l.source,l.period_start,l.visit_id,l.contractor_id,l.context_label,
  b.vat_rate,b.price_basis,b.net_amount,b.vat_amount,b.adjustment_amount,l.order_id,
  o.is_default as order_is_default,o.created_at as order_created_at,array_position(r.item_order,b.id) as schedule_position,o.name as order_name
from public.finance_expected_balances b join public.finance_project_items l on l.studio_id=b.studio_id and l.expected_item_id=b.id
left join public.finance_project_orders o on o.studio_id=l.studio_id and o.id=l.order_id
left join lateral(select p.item_order from public.finance_project_plan_revisions p join public.finance_project_terms t
  on t.studio_id=p.studio_id and t.id=p.terms_id where p.studio_id=l.studio_id and p.project_id=l.project_id and t.order_id=l.order_id
  order by t.revision desc limit 1) r on true;
create or replace view public.finance_project_plan_items with(security_invoker=true) as
select b.id,b.studio_id,b.direction,b.amount,b.currency,b.category_id,b.description,b.due_date,b.expected_payment_date,
  b.commitment,b.certainty,b.is_established,b.version,b.created_by,b.created_at,b.updated_at,b.settled_amount,b.remaining_amount,
  b.payment_state,b.due_state,b.outstanding_amount,b.project_id,b.stream,b.source,b.period_start,b.visit_id,b.contractor_id,b.context_label,
  exists(select 1 from public.finance_allocations a where a.studio_id=b.studio_id and a.expected_item_id=b.id)
    or exists(select 1 from public.finance_settlement_adjustments j where j.studio_id=b.studio_id and j.expected_item_id=b.id) as has_settlement_history,
  b.vat_rate,b.price_basis,b.net_amount,b.vat_amount,e.client_note,e.schedule_percentage,b.adjustment_amount,b.order_id
from public.finance_project_expected_balances b join public.finance_expected_items e on e.studio_id=b.studio_id and e.id=b.id
where b.stream='design' and b.commitment<>'cancelled';

create view public.finance_project_order_totals with(security_invoker=true) as
with amounts as (
  select b.studio_id,b.project_id,b.order_id,b.currency,
    count(*) filter(where b.commitment<>'cancelled') as payment_count,
    sum(case when b.commitment<>'cancelled' then b.amount else 0 end) as scheduled_amount,
    sum(b.adjustment_amount) as closed_amount,sum(b.settled_amount) as collected_amount,sum(b.outstanding_amount) as outstanding_amount,
    sum(case when b.commitment<>'cancelled' then b.remaining_amount-b.outstanding_amount else 0 end) as planned_amount,
    sum(case when b.commitment<>'cancelled' then b.net_amount else 0 end) as scheduled_net_amount,
    sum(case when b.commitment<>'cancelled' then b.vat_amount else 0 end) as scheduled_vat_amount,
    sum(coalesce(a.net_amount,0)) as collected_net_amount,sum(coalesce(a.vat_amount,0)) as collected_vat_amount
  from public.finance_project_expected_balances b left join (select studio_id,expected_item_id,sum(net_amount) net_amount,sum(vat_amount) vat_amount
    from public.finance_allocations group by studio_id,expected_item_id) a on a.studio_id=b.studio_id and a.expected_item_id=b.id
  where b.stream='design' group by b.studio_id,b.project_id,b.order_id,b.currency
)
select c.studio_id,c.project_id,'design'::text as stream,c.currency,c.gross_amount as contract_amount,
  coalesce(a.scheduled_amount,0) scheduled_amount,coalesce(a.collected_amount,0) collected_amount,
  coalesce(a.outstanding_amount,0) outstanding_amount,coalesce(a.planned_amount,0) planned_amount,
  c.gross_amount-coalesce(a.scheduled_amount,0) as unscheduled_amount,
  c.net_amount as contract_net_amount,c.vat_amount as contract_vat_amount,c.gross_amount as contract_gross_amount,
  coalesce(a.scheduled_net_amount,0) scheduled_net_amount,coalesce(a.scheduled_vat_amount,0) scheduled_vat_amount,
  coalesce(a.collected_net_amount,0) collected_net_amount,coalesce(a.collected_vat_amount,0) collected_vat_amount,
  coalesce(a.closed_amount,0) closed_amount,c.order_id,coalesce(a.payment_count,0) payment_count,
  exists(select 1 from public.finance_project_items i where i.studio_id=c.studio_id and i.order_id=c.order_id) as has_payment_history
from public.finance_project_current_terms c join public.finance_project_orders o on o.studio_id=c.studio_id and o.id=c.order_id and o.status='confirmed'
left join amounts a on a.studio_id=c.studio_id and a.order_id=c.order_id and a.currency=c.currency where c.stream='design';
revoke all on public.finance_project_order_totals from public,anon,authenticated,service_role;
grant select on public.finance_project_order_totals to authenticated;

create or replace view public.finance_project_totals with(security_invoker=true) as
with values_by_stream as (
  select studio_id,project_id,stream,currency,contract_amount,scheduled_amount,collected_amount,outstanding_amount,planned_amount,unscheduled_amount,
    contract_net_amount,contract_vat_amount,contract_gross_amount,scheduled_net_amount,scheduled_vat_amount,collected_net_amount,collected_vat_amount,closed_amount
    from public.finance_project_order_totals
  union all
  select b.studio_id,b.project_id,b.stream,b.currency,null::numeric,
    sum(case when b.commitment<>'cancelled' then b.amount else 0 end),sum(b.settled_amount),sum(b.outstanding_amount),
    sum(case when b.commitment<>'cancelled' then b.remaining_amount-b.outstanding_amount else 0 end),null::numeric,
    null::numeric,null::numeric,null::numeric,
    sum(case when b.commitment<>'cancelled' then b.net_amount else 0 end),sum(case when b.commitment<>'cancelled' then b.vat_amount else 0 end),
    sum(coalesce(a.net_amount,0)),sum(coalesce(a.vat_amount,0)),sum(b.adjustment_amount)
  from public.finance_project_expected_balances b left join(select studio_id,expected_item_id,sum(net_amount) net_amount,sum(vat_amount) vat_amount
    from public.finance_allocations group by studio_id,expected_item_id) a on a.studio_id=b.studio_id and a.expected_item_id=b.id
  where b.stream<>'design' group by b.studio_id,b.project_id,b.stream,b.currency
)
select studio_id,project_id,stream,currency,sum(contract_amount) contract_amount,sum(scheduled_amount) scheduled_amount,
  sum(collected_amount) collected_amount,sum(outstanding_amount) outstanding_amount,sum(planned_amount) planned_amount,
  sum(unscheduled_amount) unscheduled_amount,sum(contract_net_amount) contract_net_amount,sum(contract_vat_amount) contract_vat_amount,
  sum(contract_gross_amount) contract_gross_amount,sum(scheduled_net_amount) scheduled_net_amount,sum(scheduled_vat_amount) scheduled_vat_amount,
  sum(collected_net_amount) collected_net_amount,sum(collected_vat_amount) collected_vat_amount,sum(closed_amount) closed_amount
from values_by_stream group by studio_id,project_id,stream,currency;

-- Preserve the existing plan, VAT, settlement and correction engines; only ownership is scoped.
CREATE OR REPLACE FUNCTION private.guard_finance_project_expected()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select * into terms from public.finance_project_current_terms where studio_id=old.studio_id and project_id=link.project_id and stream='design' and order_id=link.order_id;
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=old.studio_id and project_id=link.project_id and stream='design' and order_id=link.order_id and commitment<>'cancelled' and id<>old.id;
    if new.currency<>terms.currency then raise exception 'finance_project_currency_locked'; end if;
    if scheduled+(case when new.commitment='cancelled' then 0 else new.amount end)>terms.gross_amount then raise exception 'finance_project_over_scheduled'; end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_finance_project_terms(p_studio_id uuid, p_request_id uuid, p_project_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb:=jsonb_build_object('operation','project_terms','project',p_project_id,'input',p_input);
  v_order uuid; result uuid; old public.finance_project_terms; value numeric; digits integer; scheduled numeric; start_date date;
  vat_rate numeric; basis text; net_value numeric; vat_value numeric; gross_value numeric; revenue_tax_rate numeric; discount_type text:=coalesce(p_input->>'discountType','none'); discount_value numeric:=coalesce(nullif(p_input->>'discountValue','')::numeric,0); discount_amount numeric;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where id=p_project_id and studio_id=p_studio_id)
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_project_invalid'; end if;
  if p_input->>'stream'='design' then v_order:=private.resolve_finance_project_order(p_studio_id,p_project_id,nullif(p_input->>'orderId','')::uuid,true);
  elsif nullif(p_input->>'orderId','') is not null then raise exception 'finance_project_context_locked'; end if;
  select * into old from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=p_input->>'stream' and order_id is not distinct from v_order;
  if coalesce(old.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  value:=nullif(p_input->>'amount','')::numeric; start_date:=nullif(p_input->>'effectiveFrom','')::date;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null or (value is not null and (value<=0 or value>9999999999.9999 or value<>round(value,digits))) then raise exception 'finance_amount_invalid'; end if;
  vat_rate:=nullif(p_input->>'vatRate','')::numeric; basis:=nullif(p_input->>'priceBasis','');
  if (vat_rate is null)<>(basis is null) or (vat_rate is not null and (vat_rate<0 or vat_rate<>round(vat_rate,4) or basis not in ('net','gross'))) then raise exception 'finance_project_vat_invalid'; end if;
  revenue_tax_rate:=nullif(p_input->>'revenueTaxRate','')::numeric;
  if revenue_tax_rate is not null and (p_input->>'stream' is distinct from 'design'
    or revenue_tax_rate<0 or revenue_tax_rate<>round(revenue_tax_rate,4)) then raise exception 'finance_project_revenue_tax_invalid'; end if;
  if p_input->>'stream'<>'design' and discount_type<>'none' then raise exception 'finance_project_discount_invalid'; end if;
  discount_amount:=private.finance_discount_amount(value,discount_type,discount_value,digits);
  if value is not null then
    select net_amount,vat_amount,gross_amount into net_value,vat_value,gross_value from private.finance_vat_parts(value-discount_amount,vat_rate,basis,digits);
    if gross_value>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  end if;
  if p_input->>'stream'='design' then
    if exists(select 1 from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and stream='design' and order_id=v_order) and old.currency is distinct from p_input->>'currency' then raise exception 'finance_project_currency_locked'; end if;
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=p_studio_id and project_id=p_project_id and stream='design' and order_id=v_order and commitment<>'cancelled';
    if gross_value<scheduled then raise exception 'finance_project_over_scheduled'; end if;
  else
    if old.id is not null and start_date<=old.effective_from then raise exception 'finance_supervision_effective_date'; end if;
    if exists(select 1 from public.finance_project_items where studio_id=p_studio_id and project_id=p_project_id and source='monthly'
      and (period_start+interval '1 month')::date>start_date) then raise exception 'finance_supervision_generated_period'; end if;
  end if;
  insert into public.finance_project_terms(studio_id,project_id,stream,revision,mode,amount,currency,effective_from,effective_through,reason,created_by,vat_rate,price_basis,net_amount,vat_amount,gross_amount,revenue_tax_rate,discount_type,discount_value,discount_amount,order_id)
  values(p_studio_id,p_project_id,p_input->>'stream',coalesce(old.revision,0)+1,p_input->>'mode',value,p_input->>'currency',start_date,
    nullif(p_input->>'effectiveThrough','')::date,btrim(p_input->>'reason'),auth.uid(),vat_rate,basis,net_value,vat_value,gross_value,revenue_tax_rate,discount_type,discount_value,discount_amount,v_order) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_finance_project_item(p_studio_id uuid, p_request_id uuid, p_project_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb:=jsonb_build_object('operation','project_item','project',p_project_id,'input',p_input);
  v_order uuid; result uuid; item_id uuid; terms public.finance_project_terms; link public.finance_project_items;
  visit public.calendar_events; contractor_name text; contractor_studio uuid; scheduled numeric;
  existing public.finance_expected_items; priced record; digits integer; rate numeric; basis text; gross numeric; net_snapshot numeric; vat_snapshot numeric;
  v_stream text:=p_input->>'stream'; source text:=coalesce(p_input->>'source','manual'); item jsonb:=p_input->'item';
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id) then raise exception 'finance_project_invalid'; end if;
  if v_stream='design' then v_order:=private.resolve_finance_project_order(p_studio_id,p_project_id,nullif(p_input->>'orderId','')::uuid);
  elsif nullif(p_input->>'orderId','') is not null then raise exception 'finance_project_context_locked'; end if;
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
    select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=item_id and project_id=p_project_id and order_id is not distinct from v_order;
    if not found then raise exception 'finance_project_invalid'; end if;
    select * into existing from public.finance_expected_items where studio_id=p_studio_id and id=item_id;
    if coalesce((p_input->>'useCurrentTerms')::boolean,false) then
      select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=v_stream and order_id is not distinct from v_order;
    end if;
    -- Source identities are permanent, including after a refund/cancellation.
    if v_stream is distinct from link.stream then raise exception 'finance_project_context_locked'; end if;
  else
    if source not in ('manual','visit') then raise exception 'finance_project_source_invalid'; end if;
    select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=v_stream and order_id is not distinct from v_order;
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
  net_snapshot:=priced.net_amount; vat_snapshot:=priced.vat_amount;
  if item_id is not null and not coalesce((p_input->>'useCurrentTerms')::boolean,false)
    and not coalesce((p_input->>'useAgreementBasis')::boolean,false)
    and gross=existing.amount and item->>'currency'=existing.currency
    and rate is not distinct from existing.vat_rate and basis is not distinct from existing.price_basis then
    net_snapshot:=existing.net_amount; vat_snapshot:=existing.vat_amount;
  end if;
  if gross is null or gross<=0 or gross>9999999999.9999 or gross<>round(gross,digits) then raise exception 'finance_amount_invalid'; end if;
  if item_id is null and v_stream='design' then
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances
      where studio_id=p_studio_id and project_id=p_project_id and stream='design' and order_id=v_order and commitment<>'cancelled';
    if scheduled+(case when item->>'commitment'='cancelled' then 0 else gross end)>terms.gross_amount then raise exception 'finance_project_over_scheduled'; end if;
  end if;
  result:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_set(item,'{amount}',to_jsonb(gross),true));
  update public.finance_expected_items set vat_rate=rate,price_basis=basis,net_amount=net_snapshot,vat_amount=vat_snapshot
    where studio_id=p_studio_id and id=result;
  if item_id is null then
    insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,visit_id,contractor_id,context_label,extra_visit,order_id)
    values(p_studio_id,result,p_project_id,v_stream,terms.id,source,visit.id,nullif(p_input->>'contractorId','')::uuid,
      coalesce(contractor_name,case when visit.id is not null then visit.title||' · '||(visit.starts_at at time zone 'Europe/Kyiv')::date::text end,''),coalesce((p_input->>'extraVisit')::boolean,false),v_order);
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_finance_project_plan(p_studio_id uuid, p_request_id uuid, p_project_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payload jsonb:=jsonb_build_object('operation','project_plan','project',p_project_id,'input',p_input);
  v_order uuid; result uuid; current_terms public.finance_project_terms; old public.finance_project_plan_items;
  row_input jsonb; item_input jsonb; prepared jsonb:='[]'; allocated_items jsonb:='[]'; known jsonb; supplied_known jsonb;
  discount_type text:=coalesce(p_input->>'discountType','none'); discount_value numeric:=coalesce(nullif(p_input->>'discountValue','')::numeric,0); discount_amount numeric;
  total numeric; gross_total numeric; protected numeric; scheduled numeric:=0; digits integer; area numeric; rate numeric;
  vat_rate numeric; basis text; revenue_tax_rate numeric; basis_total numeric:=0; cumulative numeric:=0; allocated numeric:=0; target numeric; portion numeric; net_part numeric; vat_part numeric; gross_part numeric;
  item_id uuid; category_id uuid; ordered uuid[]:='{}'; reason text:=btrim(p_input->>'reason');
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id)
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null)
    then raise exception 'finance_project_invalid'; end if;
  v_order:=private.resolve_finance_project_order(p_studio_id,p_project_id,nullif(p_input->>'orderId','')::uuid,true);
  select * into current_terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order and stream='design';
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
  revenue_tax_rate:=nullif(p_input->>'revenueTaxRate','')::numeric;
  if revenue_tax_rate is not null and (revenue_tax_rate<0 or revenue_tax_rate<>round(revenue_tax_rate,4))
    then raise exception 'finance_project_revenue_tax_invalid'; end if;
  discount_amount:=private.finance_discount_amount(total,discount_type,discount_value,digits);
  select gross_amount into gross_total from private.finance_vat_parts(total-discount_amount,vat_rate,basis,digits);
  if gross_total>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  if p_input->>'pricingMethod'='area' then
    area:=(p_input->>'area')::numeric; rate:=(p_input->>'rate')::numeric;
    if area is null or rate is null or not(area>0 and area<=9999999999.9999 and rate>0 and rate<=9999999999.9999)
      or area<>round(area,4) or rate<>round(rate,4) or total<>round(area*rate,digits) then raise exception 'finance_amount_invalid'; end if;
  end if;
  -- Full active-list concurrency check includes history, including fully released matches.
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'protected',has_settlement_history) order by id),'[]'),
    coalesce(sum(amount) filter(where has_settlement_history),0)
    into known,protected from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]') into supplied_known from jsonb_array_elements(p_input->'known');
  if known is distinct from supplied_known then raise exception 'finance_version_conflict'; end if;
     for row_input in select value from jsonb_array_elements(coalesce(p_input->'protectedNotes','[]'::jsonb)) loop
       if not exists(select 1 from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order and id=(row_input->>'id')::uuid and has_settlement_history) then raise exception 'finance_project_invalid'; end if;
       update public.finance_expected_items set client_note=nullif(btrim(row_input->>'clientNote'),''),version=version+1,updated_at=now()
         where studio_id=p_studio_id and id=(row_input->>'id')::uuid and client_note is distinct from nullif(btrim(row_input->>'clientNote'),'');
     end loop;
  if exists(select 1 from jsonb_array_elements(p_input->'items') x where nullif(x->>'id','') is not null group by x->>'id' having count(*)>1)
    then raise exception 'finance_input_invalid'; end if;
  select id into category_id from public.finance_categories where studio_id=p_studio_id and default_key='project_payments' and archived_at is null;
  for row_input in select value from jsonb_array_elements(p_input->'items') loop
    item_id:=nullif(row_input->>'id','')::uuid;
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order and id=item_id;
    if item_id is not null and old.id is null then raise exception 'finance_project_invalid'; end if;
    if old.has_settlement_history then raise exception 'finance_project_settled_terms_locked'; end if;
    if row_input->>'name' is null or char_length(btrim(row_input->>'name')) not between 1 and 2000
      or (row_input->>'amount')::numeric is null or not((row_input->>'amount')::numeric>0 and (row_input->>'amount')::numeric<=9999999999.9999)
      or (row_input->>'amount')::numeric<>round((row_input->>'amount')::numeric,digits) then raise exception 'finance_amount_invalid'; end if;
    basis_total:=basis_total+(row_input->>'amount')::numeric;
    item_input:=jsonb_build_object('id',item_id,'version',old.version,'direction','incoming','amount',row_input->>'amount','currency',p_input->>'currency',
      'categoryId',coalesce(old.category_id,category_id),'description',btrim(row_input->>'name'),'dueDate',nullif(row_input->>'dueDate','')::date,
      'expectedDate',nullif(row_input->>'expectedDate','')::date,'commitment',coalesce(old.commitment,'agreed'),'certainty',coalesce(old.certainty,'fixed'),
      'established',coalesce(old.is_established,nullif(row_input->>'dueDate','')::date<=(now() at time zone 'Europe/Kyiv')::date,false));
    prepared:=prepared||jsonb_build_array(item_input);
  end loop;
  if basis_total>0 then
    if vat_rate is null then target:=0;
    elsif basis='net' then
      target:=round(basis_total*vat_rate/100,digits);
      -- A complete schedule gets the remaining client cash cents after old,
      -- protected payments, even when their VAT rate differs.
      if basis_total=round((gross_total-protected)/(1+vat_rate/100),digits)
        then target:=gross_total-protected-basis_total; end if;
    else target:=round(basis_total/(1+vat_rate/100),digits);
    end if;
    if target<0 then raise exception 'finance_project_over_scheduled'; end if;
    for item_input in select value from jsonb_array_elements(prepared) loop
      cumulative:=cumulative+(item_input->>'amount')::numeric;
      portion:=round(cumulative*target/basis_total,digits)-allocated;
      allocated:=allocated+portion;
      if vat_rate is null then net_part:=(item_input->>'amount')::numeric; vat_part:=0; gross_part:=net_part;
      elsif basis='net' then net_part:=(item_input->>'amount')::numeric; vat_part:=portion; gross_part:=net_part+vat_part;
      else gross_part:=(item_input->>'amount')::numeric; net_part:=portion; vat_part:=gross_part-net_part;
      end if;
      scheduled:=scheduled+gross_part;
      allocated_items:=allocated_items||jsonb_build_array(item_input||jsonb_build_object('gross',gross_part,'net',net_part,'vat',vat_part));
    end loop;
    prepared:=allocated_items;
  end if;
  if protected+scheduled>gross_total then raise exception 'finance_project_over_scheduled'; end if;
  if protected+scheduled<gross_total and not coalesce((p_input->>'allowUnscheduled')::boolean,false) then raise exception 'finance_project_plan_remainder'; end if;
  -- Close removed unpaid items via the existing reasoned cancellation boundary.
  for old in select * from public.finance_project_plan_items b where studio_id=p_studio_id and project_id=p_project_id and order_id=v_order and not has_settlement_history
    and not exists(select 1 from jsonb_array_elements(prepared) i where nullif(i->>'id','')::uuid=b.id)
  loop
    perform public.cancel_finance_project_expectation(p_studio_id,gen_random_uuid(),jsonb_build_object('orderId',v_order,'itemId',old.id,'version',old.version,'settledAmount','0','reason',reason));
  end loop;
  -- Reductions first keep the existing per-item contract ceiling valid throughout.
  for item_input in select value from jsonb_array_elements(prepared) loop
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=nullif(item_input->>'id','')::uuid;
    if old.id is not null and (item_input->>'gross')::numeric<old.amount then
      perform public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('orderId',v_order,'stream','design','item',jsonb_set(item_input,'{amount}',item_input->'gross',true)));
    end if;
  end loop;
  result:=public.save_finance_project_terms(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('orderId',v_order,'stream','design','mode','design','revision',coalesce(current_terms.revision,0),'amount',total,'currency',p_input->>'currency','vatRate',vat_rate,'priceBasis',basis,'revenueTaxRate',revenue_tax_rate,'discountType',discount_type,'discountValue',discount_value,'reason',reason));
  for item_input in select value from jsonb_array_elements(prepared) loop
    item_id:=nullif(item_input->>'id','')::uuid;
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=item_id;
    -- Reduced rows get this revision's VAT snapshot after the agreement changes.
    if old.id is not null then item_input:=jsonb_set(item_input,'{version}',to_jsonb(old.version),true); end if;
    item_id:=public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,
      jsonb_build_object('orderId',v_order,'stream','design','source','manual','useCurrentTerms',true,
        'item',jsonb_set(item_input,'{amount}',item_input->'gross',true)));
    update public.finance_expected_items set net_amount=(item_input->>'net')::numeric,vat_amount=(item_input->>'vat')::numeric
      where studio_id=p_studio_id and id=item_id;
    update public.finance_expected_items set
       client_note=nullif(btrim(p_input->'items'->cardinality(ordered)->>'clientNote'),''),
       schedule_percentage=case when protected=0 and scheduled=gross_total then nullif(p_input->'items'->cardinality(ordered)->>'percentage','')::numeric else nullif(round(amount/gross_total*100,4),0) end
     where studio_id=p_studio_id and id=item_id;
     ordered:=array_append(ordered,item_id);
  end loop;
  insert into public.finance_project_plan_revisions(terms_id,studio_id,project_id,pricing_method,area_snapshot,rate_per_m2,item_order)
    values(result,p_studio_id,p_project_id,p_input->>'pricingMethod',area,rate,ordered);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_finance_project_expectation(p_studio_id uuid, p_request_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb:=jsonb_build_object('operation','project_cancellation','input',p_input);
  result uuid; original public.finance_expected_items; link public.finance_project_items;
  paid numeric; retained_net numeric; allocations jsonb; allocation jsonb; reason text:=btrim(p_input->>'reason');
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if reason is null or char_length(reason) not between 1 and 2000 then raise exception 'finance_project_reason_required'; end if;
  select * into original from public.finance_expected_items where studio_id=p_studio_id and id=(p_input->>'itemId')::uuid;
  select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=original.id;
  if nullif(p_input->>'orderId','') is not null and link.order_id is distinct from (p_input->>'orderId')::uuid then raise exception 'finance_project_context_locked'; end if;
  if link.expected_item_id is null or original.commitment='cancelled' then raise exception 'finance_project_invalid'; end if;
  select coalesce(sum(amount),0),coalesce(sum(net_amount),0) into paid,retained_net
    from public.finance_allocations where studio_id=p_studio_id and expected_item_id=original.id;
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
    -- Preserve the original category even if it has since been archived.
    insert into public.finance_expected_items(id,studio_id,direction,amount,currency,category_id,description,due_date,expected_payment_date,commitment,certainty,is_established,created_by)
      values(result,p_studio_id,original.direction,paid,original.currency,original.category_id,original.description,original.due_date,original.expected_payment_date,'agreed','fixed',original.is_established,auth.uid());
    update public.finance_expected_items set vat_rate=original.vat_rate,price_basis=original.price_basis,
      net_amount=retained_net,vat_amount=paid-retained_net where studio_id=p_studio_id and id=result;
    -- Visit/month source identities remain permanently reserved on the original.
    insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,contractor_id,context_label,order_id)
      values(p_studio_id,result,link.project_id,link.stream,link.terms_id,'manual',link.contractor_id,link.context_label,link.order_id);
    for allocation in select value from jsonb_array_elements(allocations) loop
      perform public.allocate_finance_payment(p_studio_id,gen_random_uuid(),result,(allocation->>'movement')::uuid,(allocation->>'amount')::numeric);
    end loop;
  end if;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.clear_amended_payment_percentages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.stream='design' and exists(select 1 from public.finance_project_terms t
    where t.studio_id=new.studio_id and t.project_id=new.project_id and t.stream='design' and t.order_id=new.order_id
      and t.revision=new.revision-1 and t.gross_amount is distinct from new.gross_amount) then
    update public.finance_expected_items e set schedule_percentage=null
      where e.studio_id=new.studio_id and e.schedule_percentage is not null and exists(
        select 1 from public.finance_project_items p where p.studio_id=e.studio_id and p.expected_item_id=e.id and p.project_id=new.project_id and p.stream='design' and p.order_id=new.order_id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_finance_project_payment(p_studio_id uuid, p_request_id uuid, p_project_id uuid, p_item_id uuid, p_input jsonb, p_allocations jsonb, p_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb:=jsonb_build_object('operation','project_payment_batch','project',p_project_id,'item',p_item_id,
    'input',p_input,'allocations',p_allocations,'snapshot',p_snapshot);
  result uuid; selected public.finance_project_expected_balances; item public.finance_project_expected_balances;
  payment public.finance_payment_availability; plan_id uuid; plan_order uuid[]:='{}'; candidate record; allocation record;
  candidates uuid[]:='{}'; matches uuid[]:='{}'; snapshot_ids uuid[]:='{}'; snapshot_row record;
  item_digits integer; payment_digits integer; rate numeric; total numeric:=0; native_total numeric:=0;
  next_native numeric; row_native numeric; converted numeric; child_request uuid;
  selected_position integer; allocation_position integer; previous_position integer:=0;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_allocations) is distinct from 'array'
    or jsonb_typeof(p_snapshot) is distinct from 'object' or jsonb_typeof(p_snapshot->'items') is distinct from 'array'
    or not(p_snapshot ? 'planRevisionId') or p_input->>'kind' is distinct from 'incoming'
    or p_input ? 'projectReceiptSplits' or p_input ? 'projectRefundSplits'
    then raise exception 'finance_input_invalid'; end if;
  select * into selected from public.finance_project_expected_balances
    where studio_id=p_studio_id and project_id=p_project_id and id=p_item_id;
  if selected.id is null or selected.direction<>'incoming'
    or not exists(select 1 from public.finance_categories where studio_id=p_studio_id and id=selected.category_id and nature='operating')
    then raise exception 'finance_allocation_incompatible'; end if;
  if p_snapshot ? 'orderId' and nullif(p_snapshot->>'orderId','')::uuid is distinct from selected.order_id then raise exception 'finance_settlement_preview_stale'; end if;
  if selected.commitment='cancelled' or selected.remaining_amount<=0 then raise exception 'finance_settlement_preview_stale'; end if;
  select r.terms_id,r.item_order into plan_id,plan_order from public.finance_project_plan_revisions r
    join public.finance_project_terms t on t.studio_id=r.studio_id and t.id=r.terms_id
    where r.studio_id=p_studio_id and r.project_id=p_project_id and t.stream=selected.stream and t.order_id is not distinct from selected.order_id
    order by t.revision desc limit 1;
  if plan_id is distinct from nullif(p_snapshot->>'planRevisionId','')::uuid then raise exception 'finance_settlement_preview_stale'; end if;
  for candidate in select b.id,b.version,b.remaining_amount from public.finance_project_expected_balances b
    join public.finance_categories c on c.studio_id=b.studio_id and c.id=b.category_id
    where b.studio_id=p_studio_id and b.project_id=p_project_id and b.stream=selected.stream and b.order_id is not distinct from selected.order_id and b.currency=selected.currency
      and b.direction='incoming' and b.commitment<>'cancelled' and b.remaining_amount>0 and c.nature='operating'
    order by array_position(plan_order,b.id) nulls last,b.due_date nulls last,b.id
  loop
    candidates:=array_append(candidates,candidate.id);
    if not exists(select 1 from jsonb_to_recordset(p_snapshot->'items') as x("itemId" uuid,version integer,remaining numeric)
      where x."itemId"=candidate.id and x.version=candidate.version and x.remaining=candidate.remaining_amount)
      then raise exception 'finance_settlement_preview_stale'; end if;
  end loop;
  selected_position:=array_position(candidates,p_item_id);
  for snapshot_row in select * from jsonb_to_recordset(p_snapshot->'items') as x("itemId" uuid,version integer,remaining numeric)
  loop
    if snapshot_row."itemId" is null or snapshot_row."itemId"=any(snapshot_ids) or not(snapshot_row."itemId"=any(candidates))
      then raise exception 'finance_settlement_preview_stale'; end if;
    snapshot_ids:=array_append(snapshot_ids,snapshot_row."itemId");
  end loop;
  -- A reused cash request without the batch's audit record is a different operation.
  if exists(select 1 from public.finance_movements where studio_id=p_studio_id and request_id=p_request_id)
    then raise exception 'finance_request_conflict'; end if;
  result:=public.record_finance_movement(p_studio_id,p_request_id,p_input);
  select * into payment from public.finance_payment_availability where studio_id=p_studio_id and id=result;
  if payment.direction<>'incoming' or payment.nature<>'operating' then raise exception 'finance_allocation_incompatible'; end if;
  select minor_units into item_digits from public.finance_currencies where code=selected.currency;
  select minor_units into payment_digits from public.finance_currencies where code=payment.currency;
  if selected.currency=payment.currency then rate:=1;
  else
    rate:=(p_input->'settlementFx'->>'rate')::numeric;
    if rate is null or rate<=0 or rate>1000000000 or rate<>round(rate,10)
      or coalesce(p_input->'settlementFx'->>'source','') not in ('manual','nbu')
      or (p_input->'settlementFx'->>'effectiveDate')::date is distinct from payment.financial_date
      then raise exception 'finance_fx_required'; end if;
  end if;
  converted:=round(payment.original_amount*rate,item_digits);
  for allocation in select * from jsonb_to_recordset(p_allocations) as x("itemId" uuid,amount numeric)
  loop
    if allocation."itemId" is null or allocation."itemId"=any(matches) or not(allocation."itemId"=any(candidates))
      then raise exception 'finance_allocation_incompatible'; end if;
    allocation_position:=array_position(candidates,allocation."itemId");
    if allocation_position<selected_position or allocation_position<=previous_position
      then raise exception 'finance_allocation_incompatible'; end if;
    previous_position:=allocation_position;
    matches:=array_append(matches,allocation."itemId");
    select * into item from public.finance_project_expected_balances where studio_id=p_studio_id and id=allocation."itemId";
    if allocation.amount is null or allocation.amount<=0 or allocation.amount>9999999999.9999
      or allocation.amount<>round(allocation.amount,item_digits) then raise exception 'finance_amount_invalid'; end if;
    if allocation.amount>item.remaining_amount then raise exception 'finance_overallocation'; end if;
    total:=total+allocation.amount;
    if total>converted then raise exception 'finance_overallocation'; end if;
    next_native:=case when selected.currency=payment.currency then total
      when total=converted then payment.original_amount
      else ceil(total/rate*power(10::numeric,payment_digits))/power(10::numeric,payment_digits) end;
    row_native:=next_native-native_total;
    if row_native<=0 or next_native>payment.original_amount then raise exception 'finance_settlement_split_unrepresentable'; end if;
    child_request:=md5(p_studio_id::text||':'||p_request_id::text||':project-payment:'||allocation."itemId"::text)::uuid;
    if selected.currency=payment.currency then
      perform public.allocate_finance_payment(p_studio_id,child_request,allocation."itemId",result,allocation.amount);
    else
      perform private.allocate_finance_payment_cross(p_studio_id,child_request,allocation."itemId",result,
        allocation.amount,row_native,p_input->'settlementFx');
    end if;
    native_total:=next_native;
  end loop;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $function$;

-- One pure draft preview uses the same discount/VAT primitives and cumulative
-- schedule-cent distribution as the canonical builder. It creates no ledger rows.
create function private.finance_project_order_draft_values(p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  digits integer; total numeric; discount numeric; net_value numeric; vat_value numeric; gross_value numeric;
  vat_rate numeric; basis text; revenue_tax numeric; area numeric; rate numeric;
  row_input jsonb; rows jsonb:='[]'; row_amount numeric; basis_total numeric:=0; cumulative numeric:=0;
  target numeric:=0; allocated numeric:=0; portion numeric; row_net numeric; row_vat numeric; row_gross numeric; scheduled numeric:=0;
  keys uuid[]:='{}'; draft_key uuid; pct numeric; due date; expected date;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'pricingMethod' is null
    or p_input->>'pricingMethod' not in ('fixed','area')
    or jsonb_typeof(p_input->'items') is distinct from 'array'
    or jsonb_typeof(p_input->'known') is distinct from 'array' or p_input->'known'<>'[]'::jsonb
    or p_input->>'reason' is null or char_length(btrim(p_input->>'reason')) not between 1 and 2000
    then raise exception 'finance_input_invalid'; end if;
  total:=nullif(p_input->>'amount','')::numeric;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if total is null or digits is null or not(total>0 and total<=9999999999.9999) or total<>round(total,digits)
    then raise exception 'finance_amount_invalid'; end if;
  vat_rate:=nullif(p_input->>'vatRate','')::numeric; basis:=nullif(p_input->>'priceBasis','');
  if (vat_rate is null)<>(basis is null) or (vat_rate is not null and (vat_rate<0 or vat_rate<>round(vat_rate,4) or basis not in ('net','gross')))
    then raise exception 'finance_project_vat_invalid'; end if;
  revenue_tax:=nullif(p_input->>'revenueTaxRate','')::numeric;
  if revenue_tax is not null and (revenue_tax<0 or revenue_tax<>round(revenue_tax,4)) then raise exception 'finance_project_revenue_tax_invalid'; end if;
  discount:=private.finance_discount_amount(total,coalesce(p_input->>'discountType','none'),coalesce(nullif(p_input->>'discountValue','')::numeric,0),digits);
  select net_amount,vat_amount,gross_amount into net_value,vat_value,gross_value from private.finance_vat_parts(total-discount,vat_rate,basis,digits);
  if gross_value>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  if p_input->>'pricingMethod'='area' then
    area:=nullif(p_input->>'area','')::numeric; rate:=nullif(p_input->>'rate','')::numeric;
    if area is null or rate is null or not(area>0 and area<=9999999999.9999 and rate>0 and rate<=9999999999.9999)
      or area<>round(area,4) or rate<>round(rate,4) or total<>round(area*rate,digits) then raise exception 'finance_amount_invalid'; end if;
  end if;
  for row_input in select value from jsonb_array_elements(p_input->'items') loop
    draft_key:=nullif(row_input->>'draftKey','')::uuid;
    row_amount:=nullif(row_input->>'amount','')::numeric; pct:=nullif(row_input->>'percentage','')::numeric;
    due:=nullif(row_input->>'dueDate','')::date; expected:=nullif(row_input->>'expectedDate','')::date;
    if jsonb_typeof(row_input) is distinct from 'object' or draft_key is null or draft_key=any(keys)
      or nullif(row_input->>'id','') is not null or row_input->>'name' is null
      or char_length(btrim(row_input->>'name')) not between 1 and 2000
      or char_length(coalesce(row_input->>'clientNote',''))>300
      or (pct is not null and (pct<=0 or pct>100 or pct<>round(pct,4)))
      or (due is not null and due not between date '1900-01-01' and date '9999-12-31')
      or (expected is not null and expected not between date '1900-01-01' and date '9999-12-31')
      then raise exception 'finance_input_invalid'; end if;
    if row_amount is null or not(row_amount>0 and row_amount<=9999999999.9999) or row_amount<>round(row_amount,digits)
      then raise exception 'finance_amount_invalid'; end if;
    keys:=array_append(keys,draft_key); basis_total:=basis_total+row_amount;
  end loop;
  if basis_total>0 then
    if vat_rate is null then target:=0;
    elsif basis='net' then
      target:=round(basis_total*vat_rate/100,digits);
      if basis_total=round(gross_value/(1+vat_rate/100),digits) then target:=gross_value-basis_total; end if;
    else target:=round(basis_total/(1+vat_rate/100),digits); end if;
    if target<0 then raise exception 'finance_project_over_scheduled'; end if;
    for row_input in select value from jsonb_array_elements(p_input->'items') loop
      row_amount:=(row_input->>'amount')::numeric; cumulative:=cumulative+row_amount;
      portion:=round(cumulative*target/basis_total,digits)-allocated; allocated:=allocated+portion;
      if vat_rate is null then row_net:=row_amount; row_vat:=0; row_gross:=row_net;
      elsif basis='net' then row_net:=row_amount; row_vat:=portion; row_gross:=row_net+row_vat;
      else row_gross:=row_amount; row_net:=portion; row_vat:=row_gross-row_net; end if;
      scheduled:=scheduled+row_gross;
      rows:=rows||jsonb_build_array(row_input||jsonb_build_object('netAmount',row_net,'vatAmount',row_vat,'grossAmount',row_gross));
    end loop;
  end if;
  if scheduled>gross_value then raise exception 'finance_project_over_scheduled'; end if;
  if scheduled<gross_value and not coalesce((p_input->>'allowUnscheduled')::boolean,false) then raise exception 'finance_project_plan_remainder'; end if;
  return p_input||jsonb_build_object('discountAmount',discount,'netAmount',net_value,'vatAmount',vat_value,'grossAmount',gross_value,'preparedItems',rows);
end $$;
revoke all on function private.finance_project_order_draft_values(jsonb) from public,anon,authenticated,service_role;

create function public.save_finance_project_order(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  payload jsonb:=jsonb_build_object('operation','project_order','project',p_project_id,'input',p_input);
  result uuid; existing public.finance_project_orders; intent text:=p_input->>'intent';
  order_name text:=btrim(p_input->>'name'); plan jsonb; preview jsonb; rows jsonb;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id)
    or not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null)
    then raise exception 'finance_project_invalid'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or intent is null
    or intent not in ('create','saveDraft','rename','confirm','discard') then raise exception 'finance_input_invalid'; end if;
  if intent='create' then
    if nullif(p_input->>'orderId','') is not null or order_name is null or char_length(order_name) not between 1 and 2000
      then raise exception 'finance_input_invalid'; end if;
    plan:=nullif(p_input->'plan','null'::jsonb);
    if plan is not null then preview:=private.finance_project_order_draft_values(plan); end if;
    insert into public.finance_project_orders(studio_id,project_id,name,is_default,draft_plan,created_by,updated_by)
    values(p_studio_id,p_project_id,order_name,not exists(select 1 from public.finance_project_orders
      where studio_id=p_studio_id and project_id=p_project_id and is_default and status<>'discarded'),plan,auth.uid(),auth.uid()) returning id into result;
  else
    select * into existing from public.finance_project_orders where studio_id=p_studio_id and project_id=p_project_id
      and id=nullif(p_input->>'orderId','')::uuid for update;
    if existing.id is null or existing.status='discarded' then raise exception 'finance_project_order_invalid'; end if;
    if existing.version is distinct from (p_input->>'version')::integer then raise exception 'finance_version_conflict'; end if;
    result:=existing.id;
    if intent='rename' then
      if order_name is null or char_length(order_name) not between 1 and 2000 then raise exception 'finance_input_invalid'; end if;
      update public.finance_project_orders set name=order_name,version=version+1,updated_by=auth.uid(),updated_at=now() where id=result;
    else
      if existing.status<>'draft' then raise exception 'finance_project_order_history_locked'; end if;
      if intent='saveDraft' then
        plan:=p_input->'plan'; preview:=private.finance_project_order_draft_values(plan);
        update public.finance_project_orders set draft_plan=plan,version=version+1,updated_by=auth.uid(),updated_at=now() where id=result;
      elsif intent='discard' then
        update public.finance_project_orders set status='discarded',discarded_at=now(),version=version+1,updated_by=auth.uid(),updated_at=now() where id=result;
      else
        preview:=private.finance_project_order_draft_values(existing.draft_plan);
        -- The status change and canonical publication are one transaction. A failed
        -- plan validation rolls back confirmation, including all child writes.
        select coalesce(jsonb_agg((value-'draftKey')||jsonb_build_object('id','') order by ordinality),'[]') into rows
          from jsonb_array_elements(existing.draft_plan->'items') with ordinality;
        plan:=existing.draft_plan||jsonb_build_object('orderId',result,'revision',0,'known','[]'::jsonb,'items',rows);
        update public.finance_project_orders set status='confirmed',confirmed_at=now(),version=version+1,updated_by=auth.uid(),updated_at=now() where id=result;
        perform public.save_finance_project_plan(p_studio_id,gen_random_uuid(),p_project_id,plan);
      end if;
    end if;
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
revoke all on function public.save_finance_project_order(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_project_order(uuid,uuid,uuid,jsonb) to authenticated;

-- Excess cash retains the originating order as context through corrections.
create or replace view public.finance_project_payment_context with(security_invoker=true) as
with recursive project_payments(studio_id,project_id,movement_id,order_id) as (
  select r.studio_id,(r.payload->>'project')::uuid,r.result_id,i.order_id
  from public.finance_planning_requests r join public.finance_movements m on m.studio_id=r.studio_id and m.id=r.result_id
  join public.finance_project_items i on i.studio_id=r.studio_id and i.expected_item_id=(r.payload->>'item')::uuid
  where r.payload->>'operation'='project_payment_batch' and m.kind='incoming' and m.nature='operating'
  union
  select c.studio_id,p.project_id,c.replacement_movement_id,p.order_id
  from project_payments p join public.finance_movement_corrections c on c.studio_id=p.studio_id and c.original_movement_id=p.movement_id
  join public.finance_movements m on m.studio_id=c.studio_id and m.id=c.replacement_movement_id where m.kind='incoming' and m.nature='operating'
) select studio_id,project_id,movement_id,order_id from project_payments;
