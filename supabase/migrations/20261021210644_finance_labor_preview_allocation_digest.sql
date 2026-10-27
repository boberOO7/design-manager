-- Amount-only manual allocation changes must invalidate a setup cost preview,
-- even when payroll totals and the manual-ownership flag are unchanged.
alter function public.preview_finance_labor_activation(uuid,jsonb) rename to preview_finance_labor_before_allocation_digest;
alter function public.preview_finance_labor_before_allocation_digest(uuid,jsonb) set schema private;
revoke all on function private.preview_finance_labor_before_allocation_digest(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.preview_finance_labor_activation(p_studio_id uuid,p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; allocations jsonb;
begin
  result:=private.preview_finance_labor_before_allocation_digest(p_studio_id,p_input);
  select coalesce(jsonb_agg(to_jsonb(a) order by a.entry_id,a.project_id),'[]') into allocations
    from public.finance_current_labor_allocations a where a.studio_id=p_studio_id;
  return result||jsonb_build_object('digest',md5((result||jsonb_build_object('allocations',allocations))::text));
end $$;
revoke all on function public.preview_finance_labor_activation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_finance_labor_activation(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
