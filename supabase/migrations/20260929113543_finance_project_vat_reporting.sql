-- Cash Flow uses gross ledger effects. P&L subtracts only VAT attributed to
-- project obligations, using each immutable allocation's obligation-currency VAT.
create view public.finance_project_vat_actuals with(security_invoker=true) as
with assigned as (
  select a.studio_id,a.id,a.vat_amount,a.amount,a.payment_amount,a.movement_id,a.cause_movement_id,
    m.financial_date as original_date,m.kind as original_kind,
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
  where a.vat_amount<>0 and m.kind='incoming'
), slices as (
  select studio_id,case when cause_movement_id is null then original_date else cause_date end as financial_date,
    case when cause_movement_id is null then round(original_reporting*payment_amount/abs(original_cash)*vat_amount/amount,digits)
      else round(cause_reporting*(-payment_amount)/abs(cause_cash)*vat_amount/amount,digits) end as vat_reporting_amount
  from assigned
  union all
  -- Reversing a refund reverses that refund's original VAT composition even
  -- though the released allocation is intentionally not resurrected.
  select a.studio_id,r.financial_date,
    round(re.reporting_amount*(-a.payment_amount)/abs(a.cause_cash)*a.vat_amount/a.amount,a.digits)
  from assigned a
  join public.finance_movements r on r.studio_id=a.studio_id and r.related_movement_id=a.cause_movement_id and r.kind='reversal'
  join public.finance_movement_entries re on re.studio_id=r.studio_id and re.movement_id=r.id and re.entry_role='primary'
  where a.cause_kind='refund'
)
select studio_id,financial_date,sum(vat_reporting_amount) as vat_reporting_amount
from slices group by studio_id,financial_date;
revoke all on public.finance_project_vat_actuals from public,anon,authenticated,service_role;
grant select on public.finance_project_vat_actuals to authenticated;
