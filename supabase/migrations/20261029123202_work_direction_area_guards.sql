-- Moving an unstarted stage must preserve the existing area-allocation invariant.
create trigger validate_direction_stage_area before update of direction_id on public.project_task_stage_columns
  for each row when(old.direction_id is distinct from new.direction_id)
  execute function private.validate_stage_progress_method();

create function private.guard_direction_allocated_area() returns trigger
language plpgsql security definer set search_path='' as $$
declare allocated numeric;
begin
  perform 1 from public.projects where id=new.project_id for update;
  select coalesce(sum(t.completed_area_m2),0) into allocated from public.tasks t
    join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage
    where s.direction_id=new.id and s.progress_method='area' and t.status<>'cancelled';
  if allocated>new.area_m2 then raise exception 'direction_area_allocated'; end if;
  return new;
end $$;
revoke all on function private.guard_direction_allocated_area() from public,anon,authenticated;
create trigger guard_direction_allocated_area before update of area_m2 on public.project_work_directions
  for each row when(old.area_m2 is distinct from new.area_m2) execute function private.guard_direction_allocated_area();
