-- Payment availability remains broad for matching. This narrower view powers the
-- attention surface for explicit advances and money with settlement history.
create view public.finance_actionable_unapplied with (security_invoker=true) as
select payment.*
from public.finance_payment_availability payment
join public.finance_movements movement
  on movement.studio_id=payment.studio_id and movement.id=payment.id
where payment.unapplied_amount>0 and (
  movement.request_payload @> '{"allocationIntent":true}'::jsonb
  or exists (
    select 1 from public.finance_allocations allocation
    where allocation.studio_id=payment.studio_id and allocation.movement_id=payment.id
  )
);

revoke all on public.finance_actionable_unapplied from public,anon,authenticated,service_role;
grant select on public.finance_actionable_unapplied to authenticated;
