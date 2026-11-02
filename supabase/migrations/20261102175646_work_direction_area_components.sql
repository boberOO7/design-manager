-- Additional direction scope belongs to production; Finance keeps independent revision snapshots.
create function private.valid_work_direction_components(p_components jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare component jsonb;
begin
  if p_components is null or p_components='null'::jsonb then return true; end if;
  if jsonb_typeof(p_components) is distinct from 'array' then return false; end if;
  for component in select value from jsonb_array_elements(p_components) loop
    if jsonb_typeof(component) is distinct from 'object' then return false; end if;
    if jsonb_typeof(component->'name') is distinct from 'string' or char_length(btrim(component->>'name')) not between 1 and 2000
      or jsonb_typeof(component->'actualArea') is distinct from 'string' or jsonb_typeof(component->'coefficient') is distinct from 'string'
      or (component->>'actualArea') !~ '^\d+(\.\d+)?$' or (component->>'coefficient') !~ '^\d+(\.\d+)?$'
      or component-array['name','actualArea','coefficient']<>'{}'::jsonb then return false; end if;
    if not((component->>'actualArea')::numeric>0 and (component->>'actualArea')::numeric<'Infinity'::numeric
      and (component->>'coefficient')::numeric>0 and (component->>'coefficient')::numeric<'Infinity'::numeric) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function private.valid_work_direction_components(jsonb) from public,anon,authenticated,service_role;

create function private.work_direction_equivalent_area(p_area numeric,p_coefficient numeric,p_components jsonb)
returns numeric language plpgsql immutable set search_path='' as $$
declare result numeric:=p_area*p_coefficient; component jsonb;
begin
  if not private.valid_work_direction_components(p_components) then raise exception 'direction_invalid'; end if;
  for component in select value from jsonb_array_elements(coalesce(nullif(p_components,'null'::jsonb),'[]'::jsonb)) loop
    result:=result+(component->>'actualArea')::numeric*(component->>'coefficient')::numeric;
  end loop;
  return result;
end $$;
revoke all on function private.work_direction_equivalent_area(numeric,numeric,jsonb) from public,anon,authenticated,service_role;

alter table public.project_work_directions
  add column area_components jsonb,
  add column equivalent_area_m2 numeric generated always as(private.work_direction_equivalent_area(area_m2,complexity_coefficient,area_components)) stored,
  add constraint project_work_direction_components_check check(private.valid_work_direction_components(area_components));
alter table public.productivity_attributions add column source_components jsonb;
create or replace function private.valid_finance_area_calculation(p_method text,p_area numeric,p_calculation jsonb)
returns boolean language sql immutable set search_path='' as $$
  select case
    when p_calculation is null or p_calculation='null'::jsonb then true
    when p_method is distinct from 'area' or p_area is null or jsonb_typeof(p_calculation)<>'object' then false
    when jsonb_typeof(p_calculation->'actualArea') is distinct from 'string'
      or jsonb_typeof(p_calculation->'coefficient') is distinct from 'string'
      or (p_calculation->>'actualArea') !~ '^\d+(\.\d+)?$'
      or (p_calculation->>'coefficient') !~ '^\d+(\.\d+)?$'
      or p_calculation-array['actualArea','coefficient']<>'{}'::jsonb then false
    else (p_calculation->>'actualArea')::numeric>0 and (p_calculation->>'coefficient')::numeric>0
      and p_area=round((p_calculation->>'actualArea')::numeric*(p_calculation->>'coefficient')::numeric,4)
  end;
$$;

create or replace function private.finance_area_components_area(p_components jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare component jsonb; result numeric:=0;
begin
  if p_components is null or p_components='null'::jsonb then return null; end if;
  if jsonb_typeof(p_components) is distinct from 'array' then raise exception 'finance_input_invalid'; end if;
  if jsonb_array_length(p_components)=0 then raise exception 'finance_input_invalid'; end if;
  for component in select value from jsonb_array_elements(p_components) loop
    if jsonb_typeof(component) is distinct from 'object' then raise exception 'finance_input_invalid'; end if;
    if jsonb_typeof(component->'name') is distinct from 'string'
      or char_length(btrim(component->>'name')) not between 1 and 2000
      or jsonb_typeof(component->'actualArea') is distinct from 'string'
      or jsonb_typeof(component->'coefficient') is distinct from 'string'
      or (component->>'actualArea') !~ '^\d+(\.\d+)?$'
      or (component->>'coefficient') !~ '^\d+(\.\d+)?$'
      or component-array['name','actualArea','coefficient']<>'{}'::jsonb then raise exception 'finance_input_invalid'; end if;
    if (component->>'actualArea')::numeric<=0 or (component->>'coefficient')::numeric<=0 then raise exception 'finance_amount_invalid'; end if;
    result:=result+round((component->>'actualArea')::numeric*(component->>'coefficient')::numeric,4);
  end loop;
  if result<=0 or result>9999999999.9999 then raise exception 'finance_amount_invalid'; end if;
  return result;
end;
$$;

create or replace function private.save_project_work_direction(p_project_id uuid,p_input jsonb,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare project public.projects; direction public.project_work_directions; result uuid;
  intent text:=p_input->>'intent'; stage_key text; source_stage text; position integer; other_direction uuid;
  requested_id uuid:=nullif(p_input->>'id','')::uuid; v_template_id uuid:=nullif(p_input->>'templateId','')::uuid;
  area numeric:=(p_input->>'areaM2')::numeric; coefficient numeric:=(p_input->>'coefficient')::numeric; components jsonb;
begin
  select * into project from public.projects where id=p_project_id for update;
  if not found or not coalesce(private.is_studio_admin(project.studio_id),false) then raise exception 'direction_not_admin'; end if;
  if project.status='archived' or project.archived_at is not null then raise exception 'direction_read_only'; end if;
  if project.stage_configuration_version is distinct from p_expected_version then raise exception 'direction_version_conflict'; end if;
  if requested_id is not null then
    select * into direction from public.project_work_directions where id=requested_id and project_id=p_project_id;
    if not found then raise exception 'direction_invalid'; end if;
  end if;
  if intent='remove' then
    if direction.id is null or direction.is_default
      or exists(select 1 from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage where s.direction_id=direction.id)
      or exists(select 1 from public.finance_order_work_directions where direction_id=direction.id)
      or exists(select 1 from public.productivity_attributions where direction_id=direction.id)
      or exists(select 1 from public.finance_project_earning_milestones m join public.project_task_stage_columns s on s.project_id=m.project_id and s.stage=m.stage where s.direction_id=direction.id)
      then raise exception 'direction_has_work'; end if;
    delete from public.project_task_stage_columns where direction_id=direction.id;
    delete from public.project_work_directions where id=direction.id;
    result:=direction.id;
  elsif intent in ('up','down') then
    if direction.id is null then raise exception 'direction_invalid'; end if;
    select id into other_direction from public.project_work_directions where project_id=p_project_id and id<>direction.id
      and case when intent='up' then (display_order,id)<(direction.display_order,direction.id) else (display_order,id)>(direction.display_order,direction.id) end
      order by case when intent='up' then -display_order else display_order end,id limit 1;
    if other_direction is not null then
      update public.project_work_directions set display_order=case when id=direction.id then (select display_order from public.project_work_directions where id=other_direction) else direction.display_order end
      where id in (direction.id,other_direction);
    end if;
    result:=direction.id;
  elsif intent='save' then
    if project.status='completed' then raise exception 'direction_read_only'; end if;
    components:=case when p_input ? 'areaComponents' then nullif(p_input->'areaComponents','null'::jsonb) else direction.area_components end;
    if not private.valid_work_direction_components(components) then raise exception 'direction_invalid'; end if;
    if char_length(btrim(coalesce(p_input->>'name',''))) not between 1 and 80 or area is null or not(area>0 and area<'Infinity'::numeric)
      or coefficient is null or not(coefficient>0 and coefficient<'Infinity'::numeric) then raise exception 'direction_invalid'; end if;
    if direction.id is null then
      select coalesce(max(display_order),0)+1 into position from public.project_work_directions where project_id=p_project_id;
      insert into public.project_work_directions(studio_id,project_id,name,display_order,area_m2,complexity_coefficient,area_components,start_date,due_date)
      values(project.studio_id,p_project_id,btrim(p_input->>'name'),position,area,coefficient,components,nullif(p_input->>'startDate','')::date,nullif(p_input->>'dueDate','')::date) returning id into result;
      select coalesce(max(display_order),0) into position from public.project_task_stage_columns where project_id=p_project_id;
      if v_template_id is not null and not exists(select 1 from public.project_templates where id=v_template_id and studio_id=project.studio_id and is_active) then raise exception 'direction_invalid'; end if;
      foreach source_stage in array array['stage_1','stage_2','stage_3','stage_4'] loop
        stage_key:='custom_'||gen_random_uuid()::text; position:=position+1;
        insert into public.project_task_stage_columns(project_id,stage,direction_id,display_name,display_order,kind,progress_weight,productivity_role,progress_method)
        values(p_project_id,stage_key,result,coalesce(p_input->'stageNames'->>source_stage,source_stage),position,
          case when source_stage='stage_4' then 'additional' else 'work' end,
          case when source_stage in ('stage_2','stage_3') then 2 else 1 end,
          case source_stage when 'stage_1' then 'initial' when 'stage_2' then 'visualization' when 'stage_3' then 'final' else 'none' end,
          case when v_template_id is not null then coalesce((select stage_progress_methods->>source_stage from public.project_templates where id=v_template_id),'equal')
            else coalesce((select stage_progress_methods->>source_stage from public.studio_direction_presets where studio_id=project.studio_id and kind=p_input->>'kind'),'equal') end);
        if v_template_id is not null and exists(select 1 from public.project_template_tasks where template_id=v_template_id and stage=source_stage) then
          perform public.apply_project_template_stage(p_project_id,v_template_id,source_stage,stage_key,nullif(p_input->>'startDate','')::date);
        end if;
      end loop;
    else
      update public.project_work_directions set name=btrim(p_input->>'name'),area_m2=area,complexity_coefficient=coefficient,area_components=components,
        start_date=nullif(p_input->>'startDate','')::date,due_date=nullif(p_input->>'dueDate','')::date where id=direction.id;
      result:=direction.id;
    end if;
  else raise exception 'direction_invalid'; end if;
  update public.projects set stage_configuration_version=stage_configuration_version+1 where id=p_project_id;
  return result;
end $$;

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
      budget:=direction.equivalent_area_m2*private.direction_role_share(new.project_id,new.stage);
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
      contributor_name,contributor_job_title,direction_id,productivity_role,source_area_m2,source_coefficient,source_components)
    values(project.studio_id,new.project_id,new.id,new.assignee_id,'task',new.stage,credit,
      coalesce(new.completed_at::timestamp at time zone 'Europe/Kyiv',now()),contributor.full_name,contributor.job_title,
      direction.id,stage_row.productivity_role,case when stage_row.productivity_role='visualization' then new.completed_area_m2 else direction.area_m2 end,direction.complexity_coefficient,
      case when stage_row.productivity_role in ('initial','final') then direction.area_components end);
  elsif old.status='completed' and new.status is distinct from 'completed' then
    update public.productivity_attributions set voided_at=now()
      where task_id=old.id and project_id=old.project_id and source_type='task' and voided_at is null;
  end if;
  return new;
end $$;

create or replace function public.get_direction_productivity_workload(p_project_ids uuid[])
returns table(task_id uuid,area_m2 numeric)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or exists(select 1 from unnest(p_project_ids) requested(id) where not exists(
    select 1 from public.projects p where p.id=requested.id and private.is_studio_admin(p.studio_id)))
    then raise exception 'direction_not_admin' using errcode='42501'; end if;
  return query
  with history as (
    select distinct on(a.task_id) a.task_id,a.direction_id,a.productivity_role,a.credited_area_m2
    from public.productivity_attributions a where a.project_id=any(p_project_ids) and a.source_type='task'
    order by a.task_id,a.created_at desc,a.id desc
  ), earned as (
    select h.direction_id,h.productivity_role,sum(h.credited_area_m2) area from history h group by h.direction_id,h.productivity_role
  ), remaining as (
    select s.direction_id,s.productivity_role,count(*) count from public.tasks t
    join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage
    where t.project_id=any(p_project_ids) and t.status<>'cancelled' and not exists(select 1 from history h where h.task_id=t.id)
    group by s.direction_id,s.productivity_role
  )
  select t.id,case when not p.include_in_productivity then 0
    when h.task_id is not null then h.credited_area_m2
    when s.productivity_role='visualization' then coalesce(t.completed_area_m2,0)*d.complexity_coefficient
    when s.productivity_role in ('initial','final') then
      trunc(greatest(d.equivalent_area_m2*private.direction_role_share(t.project_id,t.stage)-coalesce(e.area,0),0)/greatest(coalesce(r.count,1),1),12)
    else 0 end
  from public.tasks t join public.projects p on p.id=t.project_id
  join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage
  join public.project_work_directions d on d.id=s.direction_id
  left join history h on h.task_id=t.id
  left join earned e on e.direction_id=d.id and e.productivity_role=s.productivity_role
  left join remaining r on r.direction_id=d.id and r.productivity_role=s.productivity_role
  where t.project_id=any(p_project_ids) and t.status not in ('completed','cancelled');
end $$;

notify pgrst, 'reload schema';
