-- Pricing inputs and display order belong to an immutable commercial revision.
-- Existing terms, expected items, allocations and ledger remain authoritative.
create table public.finance_project_plan_revisions (
  terms_id uuid primary key,
  studio_id uuid not null,
  project_id uuid not null,
  pricing_method text not null check (pricing_method in ('fixed','area')),
  area_snapshot numeric,
  rate_per_m2 numeric,
  item_order uuid[] not null default '{}',
  foreign key(studio_id,terms_id,project_id) references public.finance_project_terms(studio_id,id,project_id) on delete restrict,
  check ((pricing_method='fixed' and area_snapshot is null and rate_per_m2 is null)
    or (pricing_method='area' and area_snapshot is not null and rate_per_m2 is not null and area_snapshot>0 and area_snapshot<=9999999999.9999 and area_snapshot=round(area_snapshot,4)
      and rate_per_m2>0 and rate_per_m2<=9999999999.9999 and rate_per_m2=round(rate_per_m2,4)))
);
create index finance_project_plan_project_idx on public.finance_project_plan_revisions(studio_id,project_id);
alter table public.finance_project_plan_revisions enable row level security;
revoke all on public.finance_project_plan_revisions from public,anon,authenticated,service_role;
grant select on public.finance_project_plan_revisions to authenticated;
create policy finance_project_plan_admin on public.finance_project_plan_revisions for select to authenticated using((select private.is_finance_admin(studio_id)));
create trigger finance_project_plan_immutable before update or delete on public.finance_project_plan_revisions for each row execute function private.reject_finance_history_change();

create view public.finance_project_plan_items with(security_invoker=true) as
select b.*,exists(select 1 from public.finance_allocations a where a.studio_id=b.studio_id and a.expected_item_id=b.id) as has_settlement_history
from public.finance_project_expected_balances b where b.stream='design' and b.commitment<>'cancelled';
revoke all on public.finance_project_plan_items from public,anon,authenticated,service_role;
grant select on public.finance_project_plan_items to authenticated;

create function public.save_finance_project_plan(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  payload jsonb:=jsonb_build_object('operation','project_plan','project',p_project_id,'input',p_input);
  result uuid; current_terms public.finance_project_terms; old public.finance_project_plan_items;
  row_input jsonb; item_input jsonb; prepared jsonb:='[]'; known jsonb; supplied_known jsonb;
  total numeric; protected numeric; scheduled numeric:=0; digits integer; area numeric; rate numeric;
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
    scheduled:=scheduled+(row_input->>'amount')::numeric;
    item_input:=jsonb_build_object('id',item_id,'version',old.version,'direction','incoming','amount',row_input->>'amount','currency',p_input->>'currency',
      'categoryId',coalesce(old.category_id,category_id),'description',btrim(row_input->>'name'),'dueDate',nullif(row_input->>'dueDate','')::date,
      'expectedDate',nullif(row_input->>'expectedDate','')::date,'commitment',coalesce(old.commitment,'agreed'),'certainty',coalesce(old.certainty,'fixed'),
      'established',coalesce(old.is_established,nullif(row_input->>'dueDate','')::date<=(now() at time zone 'Europe/Kyiv')::date,false));
    prepared:=prepared||jsonb_build_array(item_input);
  end loop;
  if protected+scheduled>total then raise exception 'finance_project_over_scheduled'; end if;
  if protected+scheduled<total and not coalesce((p_input->>'allowUnscheduled')::boolean,false) then raise exception 'finance_project_plan_remainder'; end if;
  -- Close removed unpaid items via the existing reasoned cancellation boundary.
  for old in select * from public.finance_project_plan_items b where studio_id=p_studio_id and project_id=p_project_id and not has_settlement_history
    and not exists(select 1 from jsonb_array_elements(prepared) i where nullif(i->>'id','')::uuid=b.id)
  loop
    perform public.cancel_finance_project_expectation(p_studio_id,gen_random_uuid(),jsonb_build_object('itemId',old.id,'version',old.version,'settledAmount','0','reason',reason));
  end loop;
  -- Reductions first keep the existing per-item contract ceiling valid throughout.
  for item_input in select value from jsonb_array_elements(prepared) loop
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=nullif(item_input->>'id','')::uuid;
    if old.id is not null and (item_input->>'amount')::numeric<old.amount then
      perform public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('stream','design','item',item_input));
    end if;
  end loop;
  result:=public.save_finance_project_terms(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('stream','design','mode','design','revision',coalesce(current_terms.revision,0),'amount',total,'currency',p_input->>'currency','reason',reason));
  for item_input in select value from jsonb_array_elements(prepared) loop
    item_id:=nullif(item_input->>'id','')::uuid;
    select * into old from public.finance_project_plan_items where studio_id=p_studio_id and id=item_id;
    -- A reduction was already saved; skip its second write and preserve that version.
    if old.id is null or old.version=(item_input->>'version')::integer then
      item_id:=public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,jsonb_build_object('stream','design','source','manual','item',item_input));
    end if;
    ordered:=array_append(ordered,item_id);
  end loop;
  insert into public.finance_project_plan_revisions(terms_id,studio_id,project_id,pricing_method,area_snapshot,rate_per_m2,item_order)
    values(result,p_studio_id,p_project_id,p_input->>'pricingMethod',area,rate,ordered);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;
revoke all on function public.save_finance_project_plan(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_project_plan(uuid,uuid,uuid,jsonb) to authenticated;
