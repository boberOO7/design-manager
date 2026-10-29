-- Completion history belongs to its original tenant/project even if a UUID is reused.
create index productivity_task_history_idx on public.productivity_attributions(task_id,created_at desc,id desc) where source_type='task';

create or replace function private.record_task_productivity_attribution() returns trigger
language plpgsql security definer set search_path='' as $$
declare project public.projects; stage_row public.project_task_stage_columns; direction public.project_work_directions;
  contributor public.profiles; previous public.productivity_attributions; earned numeric; remaining integer; credit numeric; budget numeric;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    select * into project from public.projects where id=new.project_id for update;
    if new.assignee_id is null then return new; end if;
    if not private.is_active_project_task_assignee(new.project_id,new.assignee_id) then
      raise exception 'Attributed task completion requires an active project-member assignee'; end if;
    select * into previous from public.productivity_attributions
      where task_id=new.id and project_id=new.project_id and studio_id=project.studio_id and source_type='task'
      order by created_at desc,id desc limit 1;
    if previous.id is not null then
      update public.productivity_attributions set voided_at=null where id=previous.id;
      return new;
    end if;
    select * into stage_row from public.project_task_stage_columns where project_id=new.project_id and stage=new.stage;
    select * into direction from public.project_work_directions where id=stage_row.direction_id;
    if stage_row.productivity_role='visualization' then
      credit:=coalesce(new.completed_area_m2,0)*direction.complexity_coefficient;
    elsif stage_row.productivity_role in ('initial','final') then
      budget:=direction.area_m2*direction.complexity_coefficient*private.direction_role_share(new.project_id,new.stage);
      select coalesce(sum(a.credited_area_m2),0) into earned from (
        select distinct on(task_id) task_id,credited_area_m2 from public.productivity_attributions
        where direction_id=direction.id and productivity_role=stage_row.productivity_role and source_type='task'
        order by task_id,created_at desc,id desc
      ) a;
      select count(*) into remaining from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage
      where s.direction_id=direction.id and s.productivity_role=stage_row.productivity_role and t.status<>'cancelled'
        and not exists(select 1 from public.productivity_attributions a where a.task_id=t.id and a.project_id=t.project_id and a.source_type='task');
      credit:=case when remaining>0 then trunc(greatest(budget-earned,0)/remaining,12) else 0 end;
    else credit:=0; end if;
    select * into contributor from public.profiles where id=new.assignee_id;
    insert into public.productivity_attributions(studio_id,project_id,task_id,contributor_id,source_type,task_stage,credited_area_m2,completed_at,
      contributor_name,contributor_job_title,direction_id,productivity_role,source_area_m2,source_coefficient)
    values(project.studio_id,new.project_id,new.id,new.assignee_id,'task',new.stage,credit,
      coalesce(new.completed_at::timestamp at time zone 'Europe/Kyiv',now()),contributor.full_name,contributor.job_title,
      direction.id,stage_row.productivity_role,case when stage_row.productivity_role='visualization' then new.completed_area_m2 else direction.area_m2 end,direction.complexity_coefficient);
  elsif old.status='completed' and new.status is distinct from 'completed' then
    update public.productivity_attributions set voided_at=now()
      where task_id=old.id and project_id=old.project_id and source_type='task' and voided_at is null;
  end if;
  return new;
end $$;
revoke all on function private.record_task_productivity_attribution() from public,anon,authenticated;

create function private.guard_task_accounting_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.productivity_attributions where task_id=new.id and project_id<>new.project_id and source_type='task')
    then raise exception 'Task identity is unavailable'; end if;
  return new;
end $$;
revoke all on function private.guard_task_accounting_identity() from public,anon,authenticated;
create trigger guard_task_accounting_identity before insert on public.tasks
  for each row execute function private.guard_task_accounting_identity();

-- Zero-area legacy/internal projects retain zero production scope.
alter table public.project_work_directions drop constraint project_work_directions_area_m2_check;
alter table public.project_work_directions add check(area_m2>=0 and area_m2<'Infinity'::numeric);
update public.project_work_directions d set area_m2=0 from public.projects p
  where d.project_id=p.id and d.is_default and d.area_m2=0.01 and d.name is null and p.total_area_m2=0;
create or replace function private.create_project_work_direction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.project_work_directions(studio_id,project_id,is_default,area_m2,start_date,due_date)
  values(new.studio_id,new.id,true,greatest(new.total_area_m2,0),new.start_date,new.due_date);
  return new;
end $$;

create function private.restore_earned_completion_date() returns trigger
language plpgsql security definer set search_path='' as $$
declare earned_on date;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    select (a.completed_at at time zone 'Europe/Kyiv')::date into earned_on
    from public.productivity_attributions a join public.projects p on p.id=new.project_id and p.studio_id=a.studio_id
    where a.task_id=new.id and a.project_id=new.project_id and a.source_type='task' order by a.created_at desc,a.id desc limit 1;
    if earned_on is not null then new.completed_at:=earned_on; end if;
  end if;
  return new;
end $$;
revoke all on function private.restore_earned_completion_date() from public,anon,authenticated;
create trigger zz_restore_earned_completion_date before update of status on public.tasks
  for each row execute function private.restore_earned_completion_date();
