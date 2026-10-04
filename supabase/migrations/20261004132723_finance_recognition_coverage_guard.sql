-- Resolve the economic month without shadowing the coverage view column.
create or replace function public.save_finance_report_coverage(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','recognition_coverage','input',p_input); result uuid;
  project uuid:=nullif(p_input->>'projectId','')::uuid; selected_month date:=(p_input->>'month')::date;
  through_date date:=(p_input->>'through')::date; prior integer;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if (select recognition_start_month from public.finance_settings where studio_id=p_studio_id) is null
    or through_date>(now() at time zone 'Europe/Kyiv')::date or selected_month<(select recognition_start_month from public.finance_settings where studio_id=p_studio_id)
    then raise exception 'finance_input_invalid'; end if;
  select revision into prior from public.finance_current_report_coverage where studio_id=p_studio_id and project_id is not distinct from project and finance_current_report_coverage.month=selected_month;
  if coalesce(prior,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  insert into public.finance_report_coverage(studio_id,project_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,labor_reviewed,overhead_reviewed,revision,reason,created_by)
  values(p_studio_id,project,selected_month,through_date,(p_input->>'revenue')::boolean,(p_input->>'direct_costs')::boolean,
    (p_input->>'labor')::boolean,(p_input->>'overhead')::boolean,coalesce(prior,0)+1,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

