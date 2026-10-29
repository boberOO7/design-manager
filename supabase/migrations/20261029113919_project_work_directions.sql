-- Directions own production scope. Commercial pricing and settlement stay order-owned.
create table public.project_work_directions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  project_id uuid not null,
  name text check(name is null or char_length(btrim(name)) between 1 and 80),
  is_default boolean not null default false,
  display_order integer not null default 1 check(display_order>0),
  area_m2 numeric not null check(area_m2>0 and area_m2<'Infinity'::numeric),
  complexity_coefficient numeric not null default 1 check(complexity_coefficient>0 and complexity_coefficient<'Infinity'::numeric),
  start_date date,
  due_date date,
  created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id,project_id),
  unique(project_id,id),
  foreign key(project_id,studio_id) references public.projects(id,studio_id) on delete cascade,
  check(start_date is null or due_date is null or start_date<=due_date)
);
create unique index project_work_directions_default_idx on public.project_work_directions(project_id) where is_default;
create index project_work_directions_project_idx on public.project_work_directions(project_id,display_order,id);
alter table public.project_work_directions enable row level security;
revoke all on public.project_work_directions from public,anon,authenticated;
grant select on public.project_work_directions to authenticated;
create policy directions_project_access on public.project_work_directions for select to authenticated
  using((select private.can_access_project(project_id)));

insert into public.project_work_directions(studio_id,project_id,is_default,area_m2,start_date,due_date)
select studio_id,id,true,greatest(total_area_m2,0.01),start_date,due_date from public.projects;

alter table public.project_task_stage_columns
  add column direction_id uuid,
  add column productivity_role text not null default 'none' check(productivity_role in ('initial','visualization','final','none'));
update public.project_task_stage_columns s set direction_id=d.id,
  productivity_role=case s.stage when 'stage_1' then 'initial' when 'stage_2' then 'visualization' when 'stage_3' then 'final' else 'none' end
from public.project_work_directions d where d.project_id=s.project_id and d.is_default;
-- Pre-existing orphan configuration rows have no project scope to backfill.
-- Preserve them; the insert guard below requires a direction for every new row.
alter table public.project_task_stage_columns add foreign key(project_id,direction_id)
  references public.project_work_directions(project_id,id) on delete restrict;
alter table public.project_task_stage_columns add check(kind='work' or productivity_role='none');
create index project_stage_direction_idx on public.project_task_stage_columns(direction_id,productivity_role);
grant select(direction_id,productivity_role) on public.project_task_stage_columns to authenticated;

create function private.create_project_work_direction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.project_work_directions(studio_id,project_id,is_default,area_m2,start_date,due_date)
  values(new.studio_id,new.id,true,greatest(new.total_area_m2,0.01),new.start_date,new.due_date);
  return new;
end $$;
revoke all on function private.create_project_work_direction() from public,anon,authenticated;
create trigger aa_create_project_work_direction after insert on public.projects
  for each row execute function private.create_project_work_direction();

create function private.assign_stage_work_direction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.direction_id is null then
    select id into new.direction_id from public.project_work_directions where project_id=new.project_id and is_default;
  end if;
  if new.direction_id is null then raise exception 'direction_invalid'; end if;
  if new.stage in ('stage_1','stage_2','stage_3') then
    new.productivity_role:=case new.stage when 'stage_1' then 'initial' when 'stage_2' then 'visualization' else 'final' end;
  end if;
  return new;
end $$;
revoke all on function private.assign_stage_work_direction() from public,anon,authenticated;
create trigger assign_stage_work_direction before insert on public.project_task_stage_columns
  for each row execute function private.assign_stage_work_direction();

create function private.guard_stage_work_direction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if row(new.direction_id,new.productivity_role) is distinct from row(old.direction_id,old.productivity_role)
    and (exists(select 1 from public.tasks where project_id=old.project_id and stage=old.stage and status<>'todo')
      or exists(select 1 from public.productivity_attributions where project_id=old.project_id and task_stage=old.stage)
      or exists(select 1 from public.work_log_entries w join public.tasks t on t.id=w.task_id where t.project_id=old.project_id and t.stage=old.stage))
    then raise exception 'direction_started_stage'; end if;
  return new;
end $$;
revoke all on function private.guard_stage_work_direction() from public,anon,authenticated;
create trigger guard_stage_work_direction before update of direction_id,productivity_role on public.project_task_stage_columns
  for each row execute function private.guard_stage_work_direction();

-- Add context only: migration never changes an earned amount, owner or reporting date.
alter table public.productivity_attributions add column direction_id uuid,
  add column productivity_role text,
  add column source_area_m2 numeric,
  add column source_coefficient numeric;
create index productivity_direction_role_idx on public.productivity_attributions(direction_id,productivity_role,task_id);
grant select(direction_id,productivity_role,source_area_m2,source_coefficient) on public.productivity_attributions to authenticated;
update public.productivity_attributions a set direction_id=d.id,
  productivity_role=case a.task_stage when 'stage_1' then 'initial' when 'stage_2' then 'visualization' when 'stage_3' then 'final' else 'none' end,
  source_coefficient=1
from public.project_work_directions d where d.project_id=a.project_id and d.is_default;

create table public.finance_order_work_directions (
  studio_id uuid not null, project_id uuid not null, order_id uuid not null, direction_id uuid not null,
  primary key(order_id,direction_id),
  foreign key(studio_id,order_id,project_id) references public.finance_project_orders(studio_id,id,project_id) on delete cascade,
  foreign key(studio_id,direction_id,project_id) references public.project_work_directions(studio_id,id,project_id) on delete restrict
);
create index finance_order_directions_direction_idx on public.finance_order_work_directions(direction_id);
alter table public.finance_order_work_directions enable row level security;
revoke all on public.finance_order_work_directions from public,anon,authenticated;
grant select on public.finance_order_work_directions to authenticated;
create policy finance_order_directions_admin on public.finance_order_work_directions for select to authenticated
  using((select private.is_finance_admin(studio_id)));
insert into public.finance_order_work_directions(studio_id,project_id,order_id,direction_id)
select o.studio_id,o.project_id,o.id,d.id from public.finance_project_orders o
join public.project_work_directions d on d.project_id=o.project_id and d.is_default;
create function private.link_order_default_direction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.finance_order_work_directions(studio_id,project_id,order_id,direction_id)
  select new.studio_id,new.project_id,new.id,id from public.project_work_directions where project_id=new.project_id and is_default;
  return new;
end $$;
revoke all on function private.link_order_default_direction() from public,anon,authenticated;
create trigger link_order_default_direction after insert on public.finance_project_orders
  for each row execute function private.link_order_default_direction();

create function public.save_finance_order_directions(p_project_id uuid,p_order_id uuid,p_direction_ids uuid[],p_expected_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare project public.projects;
begin
  select * into project from public.projects where id=p_project_id for update;
  if not found or not coalesce(private.is_finance_admin(project.studio_id),false) then raise exception 'direction_not_admin'; end if;
  if project.stage_configuration_version is distinct from p_expected_version then raise exception 'direction_version_conflict'; end if;
  if p_direction_ids is null or cardinality(p_direction_ids)=0
    or not exists(select 1 from public.finance_project_orders where id=p_order_id and project_id=p_project_id and studio_id=project.studio_id)
    or exists(select 1 from unnest(p_direction_ids) requested(id) where not exists(select 1 from public.project_work_directions d where d.id=requested.id and d.project_id=p_project_id))
    then raise exception 'direction_invalid'; end if;
  if exists(select 1 from public.finance_project_earning_milestones m join public.project_task_stage_columns s on s.project_id=m.project_id and s.stage=m.stage
    where m.order_id=p_order_id and m.active and not(s.direction_id=any(p_direction_ids))) then raise exception 'direction_has_milestones'; end if;
  delete from public.finance_order_work_directions where order_id=p_order_id;
  insert into public.finance_order_work_directions(studio_id,project_id,order_id,direction_id)
  select project.studio_id,p_project_id,p_order_id,id from (select distinct unnest(p_direction_ids) id) ids;
  update public.projects set stage_configuration_version=stage_configuration_version+1 where id=p_project_id;
end $$;
revoke all on function public.save_finance_order_directions(uuid,uuid,uuid[],integer) from public,anon;
grant execute on function public.save_finance_order_directions(uuid,uuid,uuid[],integer) to authenticated;

create function public.create_finance_direction_order(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; direction_ids uuid[]; replay boolean;
begin
  if not coalesce(private.is_finance_admin(p_studio_id),false) then raise exception 'direction_not_admin'; end if;
  perform 1 from public.projects where id=p_project_id and studio_id=p_studio_id for update;
  if not found or p_input->>'intent' is distinct from 'create' or jsonb_typeof(p_input->'directionIds') is distinct from 'array' then raise exception 'direction_invalid'; end if;
  select array_agg(value::uuid) into direction_ids from jsonb_array_elements_text(p_input->'directionIds');
  if direction_ids is null or exists(select 1 from unnest(direction_ids) requested(id) where not exists(
    select 1 from public.project_work_directions d where d.id=requested.id and d.project_id=p_project_id and d.studio_id=p_studio_id)) then raise exception 'direction_invalid'; end if;
  select exists(select 1 from public.finance_planning_requests where studio_id=p_studio_id and request_id=p_request_id) into replay;
  result:=public.save_finance_project_order(p_studio_id,p_request_id,p_project_id,p_input);
  if not replay then
    delete from public.finance_order_work_directions where order_id=result;
    insert into public.finance_order_work_directions(studio_id,project_id,order_id,direction_id)
    select p_studio_id,p_project_id,result,id from (select distinct unnest(direction_ids) id) ids;
    update public.projects set stage_configuration_version=stage_configuration_version+1 where id=p_project_id;
  end if;
  return result;
end $$;
revoke all on function public.create_finance_direction_order(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_finance_direction_order(uuid,uuid,uuid,jsonb) to authenticated;

create function private.guard_earning_direction_scope() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.stage is not null and not exists(select 1 from public.project_task_stage_columns s
    join public.finance_order_work_directions l on l.direction_id=s.direction_id and l.order_id=new.order_id
    where s.project_id=new.project_id and s.stage=new.stage) then raise exception 'direction_milestone_scope'; end if;
  return new;
end $$;
revoke all on function private.guard_earning_direction_scope() from public,anon,authenticated;
create trigger guard_earning_direction_scope before insert or update of stage,order_id on public.finance_project_earning_milestones
  for each row execute function private.guard_earning_direction_scope();

create function public.save_project_work_direction(p_project_id uuid,p_input jsonb,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare project public.projects; direction public.project_work_directions; result uuid;
  intent text:=p_input->>'intent'; stage_key text; source_stage text; position integer; other_direction uuid;
  requested_id uuid:=nullif(p_input->>'id','')::uuid; v_template_id uuid:=nullif(p_input->>'templateId','')::uuid;
  area numeric:=(p_input->>'areaM2')::numeric; coefficient numeric:=(p_input->>'coefficient')::numeric;
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
    if char_length(btrim(coalesce(p_input->>'name',''))) not between 1 and 80 or area is null or not(area>0 and area<'Infinity'::numeric)
      or coefficient is null or not(coefficient>0 and coefficient<'Infinity'::numeric) then raise exception 'direction_invalid'; end if;
    if direction.id is null then
      select coalesce(max(display_order),0)+1 into position from public.project_work_directions where project_id=p_project_id;
      insert into public.project_work_directions(studio_id,project_id,name,display_order,area_m2,complexity_coefficient,start_date,due_date)
      values(project.studio_id,p_project_id,btrim(p_input->>'name'),position,area,coefficient,nullif(p_input->>'startDate','')::date,nullif(p_input->>'dueDate','')::date) returning id into result;
      select coalesce(max(display_order),0) into position from public.project_task_stage_columns where project_id=p_project_id;
      if v_template_id is not null and not exists(select 1 from public.project_templates where id=v_template_id and studio_id=project.studio_id and is_active) then raise exception 'direction_invalid'; end if;
      foreach source_stage in array array['stage_1','stage_2','stage_3','stage_4'] loop
        stage_key:='custom_'||gen_random_uuid()::text; position:=position+1;
        insert into public.project_task_stage_columns(project_id,stage,direction_id,display_name,display_order,kind,progress_weight,productivity_role)
        values(p_project_id,stage_key,result,coalesce(p_input->'stageNames'->>source_stage,source_stage),position,
          case when source_stage='stage_4' then 'additional' else 'work' end,
          case when source_stage in ('stage_2','stage_3') then 2 else 1 end,
          case source_stage when 'stage_1' then 'initial' when 'stage_2' then 'visualization' when 'stage_3' then 'final' else 'none' end);
        if v_template_id is not null and exists(select 1 from public.project_template_tasks where template_id=v_template_id and stage=source_stage) then
          perform public.apply_project_template_stage(p_project_id,v_template_id,source_stage,stage_key,nullif(p_input->>'startDate','')::date);
        end if;
      end loop;
    else
      update public.project_work_directions set name=btrim(p_input->>'name'),area_m2=area,complexity_coefficient=coefficient,
        start_date=nullif(p_input->>'startDate','')::date,due_date=nullif(p_input->>'dueDate','')::date where id=direction.id;
      result:=direction.id;
    end if;
  else raise exception 'direction_invalid'; end if;
  update public.projects set stage_configuration_version=stage_configuration_version+1 where id=p_project_id;
  return result;
end $$;
revoke all on function public.save_project_work_direction(uuid,jsonb,integer) from public,anon;
grant execute on function public.save_project_work_direction(uuid,jsonb,integer) to authenticated;

create or replace function public.get_project_stage_configuration(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',p.stage_configuration_version,'includeInProductivity',p.include_in_productivity,'showProgress',p.show_progress,
    'stageOnePercent',(select productivity_stage_1_percent from public.studios where id=p.studio_id),
    'directions',coalesce((select jsonb_agg(to_jsonb(d) order by d.display_order,d.id) from public.project_work_directions d where d.project_id=p.id),'[]'::jsonb),
    'rows',coalesce((select jsonb_agg(to_jsonb(s) order by s.display_order,s.stage)
      from public.project_task_stage_columns s where s.project_id=p.id and s.deleted_at is null),'[]'::jsonb))
  from public.projects p where p.id=p_project_id;
$$;

create or replace function public.update_project_stage_configuration(
 p_project_id uuid,p_stages jsonb,p_include_in_productivity boolean,p_show_progress boolean,
 p_expected_version integer,p_deleted_task_ids uuid[]
) returns void language plpgsql security definer set search_path='' as $$
declare project public.projects; requested record; stage_count integer; removed_stages text[]; current_task_ids uuid[]; default_direction uuid;
begin
  select * into project from public.projects where id=p_project_id for update;
  if not found or not coalesce(private.is_studio_admin(project.studio_id),false) then raise exception 'stage_not_admin'; end if;
  if project.archived_at is not null or project.status='archived' then raise exception 'stage_read_only'; end if;
  if p_expected_version is null or project.stage_configuration_version<>p_expected_version then raise exception 'stage_version_conflict'; end if;
  if p_stages is null or jsonb_typeof(p_stages)<>'array' or p_include_in_productivity is null or p_show_progress is null or p_deleted_task_ids is null then raise exception 'stage_invalid_configuration'; end if;
  select id into default_direction from public.project_work_directions where project_id=p_project_id and is_default;
  stage_count:=jsonb_array_length(p_stages);
  if stage_count=0 or not exists(select 1 from jsonb_array_elements(p_stages) e where (e->>'is_enabled')::boolean) then raise exception 'stage_minimum_stage'; end if;
  if exists(select 1 from jsonb_to_recordset(p_stages) as e(stage text,display_name text,is_enabled boolean,display_order integer,kind text,progress_weight integer,direction_id uuid,productivity_role text)
    where e.stage is null or not(e.stage in ('stage_1','stage_2','stage_3','stage_4') or e.stage ~ '^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      or e.display_name is null or char_length(btrim(e.display_name)) not between 1 and 80 or e.is_enabled is null
      or e.display_order is null or e.display_order not between 1 and stage_count
      or e.kind is null or e.kind not in ('work','additional') or e.progress_weight is null or e.progress_weight<1
      or (e.productivity_role is not null and (e.productivity_role not in ('initial','visualization','final','none') or (e.kind='additional' and e.productivity_role<>'none')))
      or (e.direction_id is not null and not exists(select 1 from public.project_work_directions d where d.id=e.direction_id and d.project_id=p_project_id)))
    or (select count(distinct e->>'stage') from jsonb_array_elements(p_stages) e)<>stage_count
    or (select count(distinct (e->>'display_order')::integer) from jsonb_array_elements(p_stages) e)<>stage_count then raise exception 'stage_invalid_configuration'; end if;
  perform 1 from public.project_task_stage_columns where project_id=p_project_id order by stage for update;
  if exists(select 1 from jsonb_array_elements(p_stages) e join public.project_task_stage_columns s on s.project_id=p_project_id and s.stage=e->>'stage'
    where s.deleted_at is not null or s.kind<>e->>'kind') then raise exception 'stage_invalid_configuration'; end if;
  if exists(select 1 from jsonb_array_elements(p_stages) e where e->>'stage' not like 'custom_%' and not exists(
    select 1 from public.project_task_stage_columns s where s.project_id=p_project_id and s.stage=e->>'stage' and s.deleted_at is null)) then raise exception 'stage_invalid_configuration'; end if;
  select coalesce(array_agg(s.stage),'{}') into removed_stages from public.project_task_stage_columns s
    where s.project_id=p_project_id and s.deleted_at is null and not exists(select 1 from jsonb_array_elements(p_stages) e where e->>'stage'=s.stage);
  perform 1 from public.tasks where project_id=p_project_id and stage=any(removed_stages) order by id for update;
  select coalesce(array_agg(id order by id),'{}') into current_task_ids from public.tasks where project_id=p_project_id and stage=any(removed_stages);
  if current_task_ids is distinct from array(select distinct unnest(p_deleted_task_ids) order by 1) then raise exception 'stage_tasks_changed'; end if;
  if exists(select 1 from public.tasks where project_id=p_project_id and stage=any(removed_stages) and status<>'todo') then raise exception 'stage_started_tasks'; end if;
  if exists(select 1 from public.work_log_entries where task_id=any(current_task_ids)) then raise exception 'stage_logged_work'; end if;
  if exists(select 1 from public.tasks t join jsonb_array_elements(p_stages) e on e->>'stage'=t.stage
    where t.project_id=p_project_id and not(e->>'is_enabled')::boolean and t.status not in ('completed','cancelled')) then raise exception 'stage_active_tasks'; end if;
  delete from public.tasks where project_id=p_project_id and stage=any(removed_stages);
  update public.project_task_stage_columns set deleted_at=clock_timestamp(),is_enabled=false,updated_at=now()
    where project_id=p_project_id and stage=any(removed_stages);
  for requested in select * from jsonb_to_recordset(p_stages) as e(stage text,display_name text,is_enabled boolean,display_order integer,kind text,progress_weight integer,direction_id uuid,productivity_role text) loop
    insert into public.project_task_stage_columns(project_id,stage,display_name,is_enabled,display_order,kind,progress_weight,direction_id,productivity_role)
    values(p_project_id,requested.stage,btrim(requested.display_name),requested.is_enabled,requested.display_order,requested.kind,requested.progress_weight,
      coalesce(requested.direction_id,(select direction_id from public.project_task_stage_columns where project_id=p_project_id and stage=requested.stage),default_direction),
      coalesce(requested.productivity_role,(select productivity_role from public.project_task_stage_columns where project_id=p_project_id and stage=requested.stage),'none'))
    on conflict(project_id,stage) do update set display_name=excluded.display_name,is_enabled=excluded.is_enabled,
      display_order=excluded.display_order,progress_weight=excluded.progress_weight,direction_id=excluded.direction_id,productivity_role=excluded.productivity_role,updated_at=now();
  end loop;
  update public.projects set include_in_productivity=p_include_in_productivity,show_progress=p_show_progress,
    stage_configuration_version=stage_configuration_version+1 where id=p_project_id;
end $$;

-- Budget groups are semantic roles, independent of how many stages display them.
create function private.direction_role_share(p_project_id uuid,p_stage text) returns numeric
language sql stable security definer set search_path='' as $$
  select case s.productivity_role when 'initial' then st.productivity_stage_1_percent/100
    when 'final' then (100-st.productivity_stage_1_percent)/100 else 0 end
  from public.project_task_stage_columns s join public.projects p on p.id=s.project_id join public.studios st on st.id=p.studio_id
  where s.project_id=p_project_id and s.stage=p_stage;
$$;
revoke all on function private.direction_role_share(uuid,text) from public,anon,authenticated;

-- Legacy callers may refresh their projections, but earned ledger rows are now frozen.
create or replace function private.rebalance_stage_productivity(p_project_id uuid,p_stage text)
returns void language plpgsql security definer set search_path='' as $$ begin return; end $$;
drop trigger zz_sync_stage_productivity_roster on public.tasks;
drop trigger zz_sync_stage_productivity_project_area on public.projects;

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
    select * into previous from public.productivity_attributions where task_id=new.id and source_type='task' order by created_at desc,id desc limit 1;
    if previous.id is not null then
      -- Reopening cannot shift already-earned work to another person or month.
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
        and not exists(select 1 from public.productivity_attributions a where a.task_id=t.id and a.source_type='task');
      credit:=case when remaining>0 then trunc(greatest(budget-earned,0)/remaining,12) else 0 end;
    else credit:=0; end if;
    select * into contributor from public.profiles where id=new.assignee_id;
    insert into public.productivity_attributions(studio_id,project_id,task_id,contributor_id,source_type,task_stage,credited_area_m2,completed_at,
      contributor_name,contributor_job_title,direction_id,productivity_role,source_area_m2,source_coefficient)
    values(project.studio_id,new.project_id,new.id,new.assignee_id,'task',new.stage,credit,
      coalesce(new.completed_at::timestamp at time zone 'Europe/Kyiv',now()),contributor.full_name,contributor.job_title,
      direction.id,stage_row.productivity_role,case when stage_row.productivity_role='visualization' then new.completed_area_m2 else direction.area_m2 end,direction.complexity_coefficient);
  elsif old.status='completed' and new.status is distinct from 'completed' then
    update public.productivity_attributions set voided_at=now() where task_id=old.id and source_type='task' and voided_at is null;
  end if;
  return new;
end $$;

create function private.guard_earned_task_scope() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.stage is distinct from old.stage and exists(select 1 from public.productivity_attributions where task_id=old.id and source_type='task')
    and exists(select 1 from public.project_task_stage_columns a join public.project_task_stage_columns b on b.project_id=a.project_id
      where a.project_id=old.project_id and a.stage=old.stage and b.stage=new.stage
        and row(a.direction_id,a.productivity_role) is distinct from row(b.direction_id,b.productivity_role))
    then raise exception 'direction_earned_scope_locked'; end if;
  return new;
end $$;
revoke all on function private.guard_earned_task_scope() from public,anon,authenticated;
create trigger guard_earned_task_scope before update of stage on public.tasks for each row execute function private.guard_earned_task_scope();

create function private.sync_single_direction_project_area() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (select count(*) from public.project_work_directions where project_id=new.id)=1 then
    update public.project_work_directions set area_m2=new.total_area_m2 where project_id=new.id and is_default;
  end if;
  return new;
end $$;
revoke all on function private.sync_single_direction_project_area() from public,anon,authenticated;
create trigger sync_single_direction_project_area after update of total_area_m2 on public.projects
  for each row when(old.total_area_m2 is distinct from new.total_area_m2) execute function private.sync_single_direction_project_area();

-- Area-progress limits belong to the direction, not the entire building/client.
create or replace function private.validate_task_stage_area_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
declare scope_id uuid; scope_area numeric; allocated numeric;
begin
  perform 1 from public.projects where id=new.project_id for update;
  select direction_id into scope_id from public.project_task_stage_columns where project_id=new.project_id and stage=new.stage and progress_method='area';
  if scope_id is null or new.status='cancelled' then return new; end if;
  select area_m2 into scope_area from public.project_work_directions where id=scope_id;
  select coalesce(sum(t.completed_area_m2),0) into allocated from public.tasks t
  join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage
  where s.direction_id=scope_id and s.progress_method='area' and t.status<>'cancelled' and t.id<>new.id;
  if allocated+coalesce(new.completed_area_m2,0)>scope_area then raise exception 'Task area allocation cannot exceed the direction design-scope area'; end if;
  return new;
end $$;
revoke all on function private.validate_task_stage_area_allocation() from public,anon,authenticated;

create or replace function private.validate_stage_progress_method() returns trigger
language plpgsql security definer set search_path='' as $$
declare scope_area numeric; allocated numeric;
begin
  if new.progress_method<>'area' then return new; end if;
  perform 1 from public.projects where id=new.project_id for update;
  select area_m2 into scope_area from public.project_work_directions where id=new.direction_id;
  select coalesce(sum(t.completed_area_m2),0) into allocated from public.tasks t
    join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage
    where t.project_id=new.project_id and t.status<>'cancelled' and (s.stage=new.stage or (s.direction_id=new.direction_id and s.progress_method='area'));
  if scope_area is null or allocated>scope_area then raise exception 'Task area allocation cannot exceed the direction design-scope area'; end if;
  return new;
end $$;
revoke all on function private.validate_stage_progress_method() from public,anon,authenticated;

create function public.get_direction_productivity_workload(p_project_ids uuid[])
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
      trunc(greatest(d.area_m2*d.complexity_coefficient*private.direction_role_share(t.project_id,t.stage)-coalesce(e.area,0),0)/greatest(coalesce(r.count,1),1),12)
    else 0 end
  from public.tasks t join public.projects p on p.id=t.project_id
  join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage
  join public.project_work_directions d on d.id=s.direction_id
  left join history h on h.task_id=t.id
  left join earned e on e.direction_id=d.id and e.productivity_role=s.productivity_role
  left join remaining r on r.direction_id=d.id and r.productivity_role=s.productivity_role
  where t.project_id=any(p_project_ids) and t.status not in ('completed','cancelled');
end $$;
revoke all on function public.get_direction_productivity_workload(uuid[]) from public,anon;
grant execute on function public.get_direction_productivity_workload(uuid[]) to authenticated;
