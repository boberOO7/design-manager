-- A standard title follows the locale; only an explicitly edited name becomes free text.
create or replace function public.save_project_work_direction(p_project_id uuid,p_input jsonb,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; v_kind text:=p_input->>'kind';
begin
  if p_input ? 'kind' and v_kind is not null and v_kind not in ('interior','facade','landscape','architecture','exterior','custom') then
    raise exception 'direction_invalid'; end if;
  result:=private.save_project_work_direction(p_project_id,p_input,p_expected_version);
  if p_input->>'intent'='save' then
    if p_input ? 'kind' then update public.project_work_directions set kind=v_kind where id=result; end if;
    if p_input->>'useDefaultName'='true' then update public.project_work_directions set name=null where id=result; end if;
    if nullif(p_input->>'id','') is null and nullif(p_input->>'templateId','') is not null
      and exists(select 1 from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage where s.direction_id=result) then
      delete from public.project_task_stage_columns s where s.direction_id=result
        and not exists(select 1 from public.tasks t where t.project_id=s.project_id and t.stage=s.stage);
    end if;
  end if;
  return result;
end $$;

