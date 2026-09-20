-- Preserve historical timestamps. Pre-migration movements precede all new captures.
alter table public.finance_movements add column posting_order bigint not null default 0;
-- Old captures cannot be reconstructed from transaction-start timestamps.
alter table public.finance_forecast_snapshots add column capture_order bigint;

create sequence private.finance_posting_order;
revoke all on sequence private.finance_posting_order from public,anon,authenticated,service_role;

create function private.assign_finance_posting_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.finance_settings where studio_id=new.studio_id for update;
  new.posting_order:=nextval('private.finance_posting_order');
  return new;
end $$;
create function private.assign_finance_capture_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.finance_settings where studio_id=new.studio_id for update;
  new.capture_order:=nextval('private.finance_posting_order');
  return new;
end $$;
revoke all on function private.assign_finance_posting_order(),private.assign_finance_capture_order() from public,anon,authenticated,service_role;
create trigger finance_movement_posting_order before insert on public.finance_movements
  for each row execute function private.assign_finance_posting_order();
create trigger finance_snapshot_capture_order before insert on public.finance_forecast_snapshots
  for each row execute function private.assign_finance_capture_order();
create index finance_movements_posting_order_idx on public.finance_movements(studio_id,posting_order);

create or replace view public.finance_planning_actuals with(security_invoker=true) as
select e.studio_id,e.financial_date,e.nature,
  case when e.entry_role='fee' then null else m.category_id end as category_id,
  case when e.entry_role='fee' then 'outgoing' else coalesce(c.direction,
    case when coalesce(original.kind,m.kind)='incoming' then 'incoming' else 'outgoing' end) end as direction,
  e.reporting_amount * case when e.entry_role='fee' then -1 when coalesce(c.direction,
    case when coalesce(original.kind,m.kind)='incoming' then 'incoming' else 'outgoing' end)='incoming' then 1 else -1 end as amount,m.created_at as recorded_at,m.posting_order
from public.finance_cash_effects e
join public.finance_movements m on m.studio_id=e.studio_id and m.id=e.movement_id
left join public.finance_categories c on c.studio_id=m.studio_id and c.id=m.category_id
left join public.finance_movements related on related.studio_id=m.studio_id and related.id=m.related_movement_id
left join public.finance_movements original on original.studio_id=m.studio_id and original.id=case when related.kind='refund' then related.related_movement_id else related.id end
where e.nature<>'transfer';
revoke all on public.finance_planning_actuals from public,anon,authenticated,service_role;
grant select on public.finance_planning_actuals to authenticated;


create or replace function public.compare_finance_forecast_snapshot(p_studio_id uuid,p_snapshot_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare saved public.finance_forecast_snapshots; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into saved from public.finance_forecast_snapshots where studio_id=p_studio_id and id=p_snapshot_id;
  if not found then raise exception 'finance_input_invalid'; end if;
  if saved.capture_order is null then raise exception 'finance_snapshot_boundary_missing'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('month',m->>'month','remaining',m->>'remaining','actual',coalesce(a.amount,0)::text) order by m->>'month'),'[]'::jsonb) into result
  from jsonb_array_elements(saved.forecast->'months') m
  left join lateral (select sum(case when direction='incoming' then amount else -amount end) as amount from public.finance_planning_actuals
    where studio_id=p_studio_id and financial_date>=(saved.forecast->>'asOf')::date and posting_order>saved.capture_order and financial_date<=(saved.forecast->>'through')::date
      and date_trunc('month',financial_date)::date=(m->>'month')::date) a on true;
  return result;
end $$;
