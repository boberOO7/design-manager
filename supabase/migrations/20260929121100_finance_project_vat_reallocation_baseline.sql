-- Keep cash that was unapplied before a refund reversal outside its restored VAT bucket.
create or replace view public.finance_project_vat_actuals with(security_invoker=true) as
with assigned as (
  select a.studio_id,a.id,a.vat_amount,a.amount,a.payment_amount,a.movement_id,a.cause_movement_id,a.released_allocation_id,
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
  where m.kind='incoming' and m.nature='operating'
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
), baseline as (
  select f.studio_id,f.movement_id,
    greatest(0,abs(entry.amount)
      - coalesce((select sum(abs(refund_entry.amount)) from public.finance_movements refund
          join public.finance_movement_entries refund_entry on refund_entry.studio_id=refund.studio_id
            and refund_entry.movement_id=refund.id and refund_entry.entry_role='primary'
          where refund.studio_id=f.studio_id and refund.related_movement_id=f.movement_id
            and refund.kind='refund' and refund.created_at<f.first_at
            and not exists(select 1 from public.finance_movements undo where undo.studio_id=refund.studio_id
              and undo.related_movement_id=refund.id and undo.kind='reversal' and undo.created_at<=f.first_at)),0)
      - coalesce((select sum(a.payment_amount) from public.finance_allocations a
          where a.studio_id=f.studio_id and a.movement_id=f.movement_id and a.created_at<f.first_at),0)
      - coalesce((select sum(-a.payment_amount) from public.finance_allocations a
          join public.finance_movements undo on undo.studio_id=a.studio_id
            and undo.related_movement_id=a.cause_movement_id and undo.kind='reversal'
          where a.studio_id=f.studio_id and a.movement_id=f.movement_id and undo.created_at=f.first_at),0)
    ) as unapplied_cash
  from first_reversal f
  join public.finance_movement_entries entry on entry.studio_id=f.studio_id
    and entry.movement_id=f.movement_id and entry.entry_role='primary'
), new_positive as (
  select x.studio_id,x.id,x.movement_id,x.created_at,
    x.payment_amount+coalesce(manual.cash,0) as effective_cash,
    coalesce(sum(x.payment_amount+coalesce(manual.cash,0)) over(
      partition by x.studio_id,x.movement_id order by x.created_at,x.id
      rows between unbounded preceding and 1 preceding),0) as cash_before
  from first_reversal f
  join public.finance_allocations x on x.studio_id=f.studio_id and x.movement_id=f.movement_id
    and x.amount>0 and x.created_at>f.first_at
  left join lateral (
    select sum(release.payment_amount) as cash from public.finance_allocations release
    where release.studio_id=x.studio_id and release.released_allocation_id=x.id
      and release.cause_movement_id is null
  ) manual on true
), reused as (
  select f.studio_id,f.movement_id,
    greatest(0,coalesce(sum(x.effective_cash),0)-baseline.unapplied_cash) as payment_amount
  from first_reversal f
  join baseline on baseline.studio_id=f.studio_id and baseline.movement_id=f.movement_id
  left join new_positive x on x.studio_id=f.studio_id and x.movement_id=f.movement_id
  group by f.studio_id,f.movement_id,baseline.unapplied_cash
), reversal_parts as (
  select a.*,
    coalesce(sum(-a.payment_amount) over(partition by a.studio_id,a.movement_id order by a.reversal_created_at,a.id
      rows between unbounded preceding and 1 preceding),0) as earlier_restored_cash,
    coalesce(reused.payment_amount,0) as reused_cash
  from reversed_refunds a
  left join reused on reused.studio_id=a.studio_id and reused.movement_id=a.movement_id
), allocation_vat as (
  select studio_id,coalesce(a.released_allocation_id,a.id) as original_id,
    sum(round(original_reporting*payment_amount/abs(original_cash)*vat_amount/amount,digits)) as vat_reporting_amount
  from assigned a where cause_movement_id is null
  group by studio_id,original_id
), reassigned as (
  select x.studio_id,a.original_date,r.reversal_date,
    round(v.vat_reporting_amount*(bounds.upper_cash-x.cash_before)/x.effective_cash,a.digits)
      - round(v.vat_reporting_amount*(bounds.lower_cash-x.cash_before)/x.effective_cash,a.digits) as vat_reporting_amount
  from new_positive x
  join assigned a on a.studio_id=x.studio_id and a.id=x.id
  join allocation_vat v on v.studio_id=x.studio_id and v.original_id=x.id
  join baseline b on b.studio_id=x.studio_id and b.movement_id=x.movement_id
  join reversal_parts r on r.studio_id=x.studio_id and r.movement_id=x.movement_id
    and x.created_at>r.reversal_created_at
  cross join lateral (
    select greatest(x.cash_before,b.unapplied_cash+r.earlier_restored_cash) as lower_cash,
      least(x.cash_before+x.effective_cash,b.unapplied_cash+r.earlier_restored_cash-r.payment_amount) as upper_cash
  ) bounds
  where x.effective_cash>0 and bounds.upper_cash>bounds.lower_cash
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
  union all
  select studio_id,original_date,-vat_reporting_amount from reassigned
  union all
  select studio_id,reversal_date,vat_reporting_amount from reassigned
)
select studio_id,financial_date,sum(vat_reporting_amount) as vat_reporting_amount
from slices group by studio_id,financial_date;
