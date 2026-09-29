-- Reversed refunds restore the original VAT only while their restored cash
-- remains unapplied. A later match contributes its own obligation VAT instead.
create or replace view public.finance_project_vat_actuals with(security_invoker=true) as
with assigned as (
  select a.studio_id,a.id,a.vat_amount,a.amount,a.payment_amount,a.movement_id,a.cause_movement_id,
    m.financial_date as original_date,
    e.amount as original_cash,e.reporting_amount as original_reporting,e.reporting_currency,
    cause.financial_date as cause_date,cause.kind as cause_kind,
    ce.amount as cause_cash,ce.reporting_amount as cause_reporting,
    c.minor_units as digits
  from public.finance_allocations a
  join public.finance_project_items p on p.studio_id=a.studio_id and p.expected_item_id=a.expected_item_id and p.stream<>'expenses'
  join public.finance_movements m on m.studio_id=a.studio_id and m.id=a.movement_id
  join public.finance_movement_entries e on e.studio_id=m.studio_id and e.movement_id=m.id and e.entry_role='primary'
  left join public.finance_movements cause on cause.studio_id=a.studio_id and cause.id=a.cause_movement_id
  left join public.finance_movement_entries ce on ce.studio_id=cause.studio_id and ce.movement_id=cause.id and ce.entry_role='primary'
  join public.finance_currencies c on c.code=e.reporting_currency
  where a.vat_amount<>0 and m.kind='incoming' and m.nature='operating'
), reversed_refunds as (
  select a.*,r.financial_date as reversal_date,r.created_at as reversal_created_at,
    re.reporting_amount as reversal_reporting
  from assigned a
  join public.finance_movements r on r.studio_id=a.studio_id and r.related_movement_id=a.cause_movement_id and r.kind='reversal'
  join public.finance_movement_entries re on re.studio_id=r.studio_id and re.movement_id=r.id and re.entry_role='primary'
  where a.cause_kind='refund'
), first_reversal as (
  select studio_id,movement_id,min(reversal_created_at) as first_at
  from reversed_refunds group by studio_id,movement_id
), reused as (
  select f.studio_id,f.movement_id,
    coalesce(sum(case when x.amount>0 then x.payment_amount
      when x.amount<0 and x.cause_movement_id is null and original.created_at>f.first_at then x.payment_amount
      else 0 end),0) as payment_amount
  from first_reversal f
  left join public.finance_allocations x on x.studio_id=f.studio_id and x.movement_id=f.movement_id and x.created_at>f.first_at
  left join public.finance_allocations original on original.studio_id=x.studio_id and original.id=x.released_allocation_id
  group by f.studio_id,f.movement_id
), reversal_parts as (
  select a.*,
    coalesce(sum(-a.payment_amount) over(partition by a.studio_id,a.movement_id order by a.reversal_created_at,a.id
      rows between unbounded preceding and 1 preceding),0) as earlier_restored_cash,
    coalesce(reused.payment_amount,0) as reused_cash
  from reversed_refunds a
  left join reused on reused.studio_id=a.studio_id and reused.movement_id=a.movement_id
), slices as (
  select studio_id,case when cause_movement_id is null then original_date else cause_date end as financial_date,
    case when cause_movement_id is null then round(original_reporting*payment_amount/abs(original_cash)*vat_amount/amount,digits)
      else round(cause_reporting*(-payment_amount)/abs(cause_cash)*vat_amount/amount,digits) end as vat_reporting_amount
  from assigned
  union all
  select studio_id,reversal_date,
    round(reversal_reporting*greatest(0,-payment_amount-greatest(0,reused_cash-earlier_restored_cash))
      /abs(cause_cash)*vat_amount/amount,digits)
  from reversal_parts
)
select studio_id,financial_date,sum(vat_reporting_amount) as vat_reporting_amount
from slices group by studio_id,financial_date;
