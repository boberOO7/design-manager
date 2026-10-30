-- Publish complete direction terms without an intermediate, empty commercial order.
-- Existing order/plan RPCs retain all pricing, VAT, history and settlement guards.
create or replace function public.create_finance_direction_order(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; direction_ids uuid[]; replay boolean;
begin
  if not coalesce(private.is_finance_admin(p_studio_id),false) then raise exception 'direction_not_admin'; end if;
  perform 1 from public.projects where id=p_project_id and studio_id=p_studio_id for update;
  if not found or p_input->>'intent' is distinct from 'create' or jsonb_typeof(p_input->'directionIds') is distinct from 'array'
    or (p_input ? 'confirm' and jsonb_typeof(p_input->'confirm') is distinct from 'boolean') then raise exception 'direction_invalid'; end if;
  select array_agg(value::uuid) into direction_ids from jsonb_array_elements_text(p_input->'directionIds');
  if direction_ids is null or exists(select 1 from unnest(direction_ids) requested(id) where not exists(
    select 1 from public.project_work_directions d where d.id=requested.id and d.project_id=p_project_id and d.studio_id=p_studio_id)) then raise exception 'direction_invalid'; end if;
  if coalesce((p_input->>'confirm')::boolean,false) and jsonb_typeof(p_input->'plan') is distinct from 'object' then raise exception 'finance_input_invalid'; end if;
  select exists(select 1 from public.finance_planning_requests where studio_id=p_studio_id and request_id=p_request_id) into replay;
  result:=public.save_finance_project_order(p_studio_id,p_request_id,p_project_id,p_input);
  if not replay then
    delete from public.finance_order_work_directions where order_id=result;
    insert into public.finance_order_work_directions(studio_id,project_id,order_id,direction_id)
    select p_studio_id,p_project_id,result,id from (select distinct unnest(direction_ids) id) ids;
    if coalesce((p_input->>'confirm')::boolean,false) then
      perform public.save_finance_project_order(p_studio_id,gen_random_uuid(),p_project_id,
        jsonb_build_object('intent','confirm','orderId',result,'version',1));
    end if;
    update public.projects set stage_configuration_version=stage_configuration_version+1 where id=p_project_id;
  end if;
  return result;
end $$;
revoke all on function public.create_finance_direction_order(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_finance_direction_order(uuid,uuid,uuid,jsonb) to authenticated;
