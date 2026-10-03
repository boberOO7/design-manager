-- Append-only linkage; cash continues to live solely in the existing ledger.
create table public.finance_movement_corrections (
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  original_movement_id uuid not null,
  reversal_movement_id uuid not null,
  replacement_movement_id uuid not null,
  primary key(studio_id,original_movement_id),
  unique(studio_id,reversal_movement_id),
  unique(studio_id,replacement_movement_id),
  foreign key(studio_id,original_movement_id) references public.finance_movements(studio_id,id) on delete restrict,
  foreign key(studio_id,reversal_movement_id) references public.finance_movements(studio_id,id) on delete restrict,
  foreign key(studio_id,replacement_movement_id) references public.finance_movements(studio_id,id) on delete restrict,
  check(original_movement_id<>replacement_movement_id and original_movement_id<>reversal_movement_id
    and reversal_movement_id<>replacement_movement_id)
);
alter table public.finance_movement_corrections enable row level security;
revoke all on public.finance_movement_corrections from public,anon,authenticated,service_role;
grant select on public.finance_movement_corrections to authenticated;
create policy finance_corrections_admin_read on public.finance_movement_corrections for select to authenticated
using((select private.is_finance_admin(studio_id)));
create trigger finance_corrections_immutable before update or delete on public.finance_movement_corrections
for each row execute function private.reject_finance_history_change();

create view public.finance_current_movements with(security_invoker=true) as
select m.* from public.finance_movements m
where m.kind<>'reversal' and not exists(
  select 1 from public.finance_movements r
  where r.studio_id=m.studio_id and r.related_movement_id=m.id and r.kind='reversal'
);
revoke all on public.finance_current_movements from public,anon,authenticated,service_role;
grant select on public.finance_current_movements to authenticated;

create function public.correct_finance_movement(p_studio_id uuid,p_request_id uuid,p_movement_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','movement_correction','movement',p_movement_id,'input',p_input);
  result uuid; original public.finance_movements; reversal uuid; setup public.finance_settings; day date;
  trip_entry public.finance_trip_entries; replacement_entry public.finance_movement_entries; trip_input jsonb;
begin
  -- Canonical admin check, parent lock and idempotency boundary.
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  if setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  select * into original from public.finance_movements where studio_id=p_studio_id and id=p_movement_id;
  if original.id is null or original.kind='reversal' then raise exception 'finance_reversal_unavailable'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' or (p_input->>'kind') is distinct from original.kind
    or (original.kind='refund' and nullif(p_input->>'relatedMovementId','')::uuid is distinct from original.related_movement_id)
    then raise exception 'finance_input_invalid'; end if;
  day:=(p_input->>'date')::date;
  if day is null or day not between date '1900-01-01' and date '9999-12-31'
    or day>(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_input_invalid'; end if;
  if exists(select 1 from public.finance_movements where studio_id=p_studio_id and request_id=p_request_id)
    then raise exception 'finance_request_conflict'; end if;
  -- Reuse the late-opening eligibility rule when moving an opening to another account.
  if original.kind='account_opening' and (p_input->>'accountId')::uuid is distinct from (
    select account_id from public.finance_movement_entries where studio_id=p_studio_id and movement_id=original.id and entry_role='primary'
  ) and exists(select 1 from public.finance_accounts a where a.studio_id=p_studio_id and a.id=(p_input->>'accountId')::uuid
    and (a.opening_balance<>0 or exists(select 1 from public.finance_movement_entries e where e.studio_id=a.studio_id and e.account_id=a.id)))
    then raise exception 'finance_opening_unavailable'; end if;
  -- Cancel on the original date: a date edit across cutover cannot leave phantom cash.
  -- Existing refund guards and allocation-release triggers remain authoritative.
  reversal:=public.reverse_finance_movement(p_studio_id,gen_random_uuid(),original.id,original.financial_date,'Correction');
  if original.kind in ('account_opening','balance_adjustment') then
    result:=private.post_finance_account_balance(p_studio_id,p_request_id,(p_input->>'accountId')::uuid,
      original.kind,day,(p_input->>'amount')::numeric,coalesce(p_input->>'description',''),p_input->'fx',p_input);
  else
    -- The existing unapplied-payment rule includes payments with settlement history.
    -- Carry that review visibility to the replacement after releasing its matches.
    if exists(select 1 from public.finance_allocations where studio_id=p_studio_id and movement_id=original.id) then
      p_input:=p_input||jsonb_build_object('allocationIntent',true);
    end if;
    result:=public.record_finance_movement(p_studio_id,p_request_id,p_input);
  end if;
  -- Keep trip cash attached to its real expense/advance using the existing immutable
  -- trip replacement workflow and its whole-payment/reconciliation guards.
  for trip_entry in select * from public.finance_trip_entries where studio_id=p_studio_id and movement_id=original.id loop
    select * into replacement_entry from public.finance_movement_entries
      where studio_id=p_studio_id and movement_id=result and entry_role='primary';
    if trip_entry.daily_rate is not null and (abs(replacement_entry.amount)<>trip_entry.amount
      or replacement_entry.currency<>trip_entry.currency) then raise exception 'finance_trip_edit_unavailable'; end if;
    trip_input:=jsonb_build_object('kind',trip_entry.kind,'expenseType',trip_entry.expense_type,'label',trip_entry.label,
      'amount',abs(replacement_entry.amount),'currency',replacement_entry.currency,'date',day,'movementId',result,
      'employeeId',trip_entry.employee_id,'note',trip_entry.note,'dailyRate',trip_entry.daily_rate,'dayCount',trip_entry.day_count);
    if trip_entry.daily_rate is not null then
      trip_input:=trip_input||jsonb_build_object('coveredTravelerIds',(
        select coalesce(jsonb_agg(employee_id),'[]'::jsonb) from public.finance_trip_entry_travelers
        where studio_id=p_studio_id and entry_id=trip_entry.id));
    end if;
    -- Original retains its unique plan link; never consume the same plan twice.
    perform public.record_finance_trip_entry(p_studio_id,gen_random_uuid(),trip_entry.trip_id,trip_input);
  end loop;
  insert into public.finance_movement_corrections values(p_studio_id,original.id,reversal,result);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
revoke all on function public.correct_finance_movement(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.correct_finance_movement(uuid,uuid,uuid,jsonb) to authenticated;

-- Follow both directions so history works from any version, including a final storno.
create function public.get_finance_movement_history_ids(p_studio_id uuid,p_movement_id uuid)
returns uuid[] language plpgsql stable security invoker set search_path='' as $$
declare result uuid[];
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  with recursive chain(id) as (
    select case when kind='reversal' then related_movement_id else id end
    from public.finance_movements where studio_id=p_studio_id and id=p_movement_id
    union
    select case when c.original_movement_id=h.id then c.replacement_movement_id else c.original_movement_id end
    from chain h join public.finance_movement_corrections c on c.studio_id=p_studio_id
      and (c.original_movement_id=h.id or c.replacement_movement_id=h.id)
  ), history as (
    select id from chain
    union select r.id from public.finance_movements r join chain h on r.related_movement_id=h.id
      where r.studio_id=p_studio_id and r.kind='reversal'
  ) select coalesce(array_agg(id),'{}'::uuid[]) into result from history;
  return result;
end $$;
revoke all on function public.get_finance_movement_history_ids(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_movement_history_ids(uuid,uuid) to authenticated;
