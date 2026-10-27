-- A capacity start is a business date, not a fabricated recognition enablement date.
alter function public.preview_finance_labor_activation(uuid,jsonb) rename to preview_finance_labor_before_posting_info;
alter function public.preview_finance_labor_before_posting_info(uuid,jsonb) set schema private;
revoke all on function private.preview_finance_labor_before_posting_info(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.preview_finance_labor_activation(p_studio_id uuid,p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; boundary date;
begin
  result:=private.preview_finance_labor_before_posting_info(p_studio_id,p_input);
  select coalesce((recognition_enabled_at at time zone 'Europe/Kyiv')::date,recognition_start_month) into boundary
    from public.finance_settings where studio_id=p_studio_id;
  result:=result||jsonb_build_object('recognitionStart',boundary);
  return result||jsonb_build_object('digest',md5(result::text));
end $$;
revoke all on function public.preview_finance_labor_activation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_finance_labor_activation(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
