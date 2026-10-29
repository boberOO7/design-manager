-- A single-direction project keeps its familiar area editor in both entry points.
create function private.sync_default_direction_area() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.is_default and (select count(*) from public.project_work_directions where project_id=new.project_id)=1 then
    update public.projects set total_area_m2=new.area_m2 where id=new.project_id and total_area_m2 is distinct from new.area_m2;
  end if;
  return new;
end $$;
revoke all on function private.sync_default_direction_area() from public,anon,authenticated;
create trigger sync_default_direction_area after update of area_m2 on public.project_work_directions
  for each row when(old.area_m2 is distinct from new.area_m2) execute function private.sync_default_direction_area();

-- Empty template lanes are not unfinished production phases in a new direction.
alter function public.save_project_work_direction(uuid,jsonb,integer) set schema private;
revoke all on function private.save_project_work_direction(uuid,jsonb,integer) from public,anon,authenticated;
create function public.save_project_work_direction(p_project_id uuid,p_input jsonb,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  result:=private.save_project_work_direction(p_project_id,p_input,p_expected_version);
  if p_input->>'intent'='save' and nullif(p_input->>'id','') is null and nullif(p_input->>'templateId','') is not null
    and exists(select 1 from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage where s.direction_id=result) then
    delete from public.project_task_stage_columns s where s.direction_id=result
      and not exists(select 1 from public.tasks t where t.project_id=s.project_id and t.stage=s.stage);
  end if;
  return result;
end $$;
revoke all on function public.save_project_work_direction(uuid,jsonb,integer) from public,anon;
grant execute on function public.save_project_work_direction(uuid,jsonb,integer) to authenticated;
