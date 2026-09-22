-- One edit transaction composes the established append-only Finance operations.
create or replace function public.edit_finance_trip_entry(p_studio_id uuid,p_request_id uuid,p_trip_id uuid,p_entry_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','trip_edit','trip',p_trip_id,'entry',p_entry_id,'input',p_input);
  result uuid; original public.finance_trip_entries; reason text; replacement jsonb;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  select * into original from public.finance_trip_entries where studio_id=p_studio_id and trip_id=p_trip_id and id=p_entry_id;
  if original.id is null or original.kind not in ('plan','expense') or original.reverses_id is not null
    or original.kind is distinct from p_input->>'kind' or original.expense_type is distinct from p_input->>'expenseType'
    or exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and reverses_id=original.id)
    then raise exception 'finance_trip_edit_unavailable'; end if;
  reason:=case when original.kind='plan' then 'Trip plan updated' else btrim(p_input->>'reason') end;
  if reason is null or char_length(reason) not between 1 and 2000 then raise exception 'finance_input_invalid'; end if;
  if original.movement_id is not null then
    -- Partially refunded or otherwise adjusted payments require their existing specialist workflow.
    if (p_input->>'confirmed')::boolean is distinct from true
      or exists(select 1 from public.finance_movements where studio_id=p_studio_id and related_movement_id=original.movement_id)
      then raise exception 'finance_trip_edit_unavailable'; end if;
    perform public.reverse_finance_movement(p_studio_id,gen_random_uuid(),original.movement_id,(now() at time zone 'Europe/Kyiv')::date,reason);
  else
    perform public.record_finance_trip_entry(p_studio_id,gen_random_uuid(),p_trip_id,jsonb_build_object('reversesId',original.id,'note',reason));
  end if;
  -- The immutable original keeps the unique plan link and its retired expectation.
  -- The edit audit links original and replacement; never consume the plan twice.
  replacement:=(p_input-'reversesId')||jsonb_build_object('planId',null);
  result:=public.record_finance_trip_entry(p_studio_id,gen_random_uuid(),p_trip_id,replacement);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
revoke all on function public.edit_finance_trip_entry(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.edit_finance_trip_entry(uuid,uuid,uuid,uuid,jsonb) to authenticated;
