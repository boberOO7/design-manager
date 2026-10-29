-- Direction identity and lifecycle are independent of object type and billing.
alter table public.project_work_directions
  add column kind text check(kind in ('interior','facade','landscape','architecture','exterior','custom')),
  add column status text not null default 'planned' check(status in ('planned','active','paused','completed'));
update public.project_work_directions d set status=case when p.status in ('active','paused','completed') then p.status else 'planned' end
from public.projects p where p.id=d.project_id;

create table public.studio_direction_presets (
  studio_id uuid not null references public.studios(id) on delete cascade,
  kind text not null check(kind in ('interior','facade','landscape','architecture','exterior','custom')),
  coefficient numeric not null default 1 check(coefficient>0 and coefficient<'Infinity'::numeric),
  recommended_min numeric check(recommended_min>0 and recommended_min<'Infinity'::numeric),
  recommended_max numeric check(recommended_max>0 and recommended_max<'Infinity'::numeric),
  template_id uuid references public.project_templates(id) on delete set null,
  version integer not null default 1 check(version>0),
  primary key(studio_id,kind),
  check((recommended_min is null and recommended_max is null)
    or (recommended_min is not null and recommended_max is not null and recommended_min<recommended_max))
);
alter table public.studio_direction_presets enable row level security;
revoke all on public.studio_direction_presets from public,anon,authenticated;
grant select on public.studio_direction_presets to authenticated;
create policy direction_presets_admin_read on public.studio_direction_presets for select to authenticated
using(private.is_studio_admin(studio_id));

create function public.save_studio_direction_preset(p_studio_id uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_kind text:=p_input->>'kind'; v_coefficient numeric:=(p_input->>'coefficient')::numeric;
  v_min numeric:=(p_input->>'recommendedMin')::numeric; v_max numeric:=(p_input->>'recommendedMax')::numeric;
  v_template uuid:=(p_input->>'templateId')::uuid; v_version integer:=(p_input->>'version')::integer;
begin
  if auth.uid() is null or not coalesce(private.is_studio_admin(p_studio_id),false) then raise exception 'direction_not_admin'; end if;
  if v_kind is null or v_kind not in ('interior','facade','landscape','architecture','exterior','custom')
    or v_coefficient is null or not(v_coefficient>0 and v_coefficient<'Infinity'::numeric)
    or v_version is null or v_version<0
    or not((v_min is null and v_max is null) or (v_min is not null and v_max is not null and v_min>0 and v_min<v_max and v_max<'Infinity'::numeric))
    or (v_template is not null and not exists(select 1 from public.project_templates where id=v_template and studio_id=p_studio_id and is_active))
    then raise exception 'direction_invalid'; end if;
  insert into public.studio_direction_presets(studio_id,kind,coefficient,recommended_min,recommended_max,template_id)
  select p_studio_id,v_kind,v_coefficient,v_min,v_max,v_template where v_version=0
  on conflict do nothing;
  if found then return; end if;
  update public.studio_direction_presets set coefficient=v_coefficient,recommended_min=v_min,recommended_max=v_max,
    template_id=v_template,version=version+1 where studio_id=p_studio_id and kind=v_kind and version=v_version;
  if not found then raise exception 'direction_version_conflict'; end if;
end $$;
revoke all on function public.save_studio_direction_preset(uuid,jsonb) from public,anon;
grant execute on function public.save_studio_direction_preset(uuid,jsonb) to authenticated;

-- Only future projects are Interior by default; legacy unnamed directions keep kind=NULL.
create or replace function private.create_project_work_direction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.project_work_directions(studio_id,project_id,is_default,kind,status,area_m2,start_date,due_date)
  values(new.studio_id,new.id,true,'interior',case when new.status in ('active','paused','completed') then new.status else 'planned' end,
    greatest(new.total_area_m2,0),new.start_date,new.due_date);
  return new;
end $$;

-- Reuse existing scope, template, allocation, concurrency and empty-lane guards.
create or replace function public.save_project_work_direction(p_project_id uuid,p_input jsonb,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; v_kind text:=p_input->>'kind';
begin
  if p_input ? 'kind' and v_kind is not null and v_kind not in ('interior','facade','landscape','architecture','exterior','custom') then
    raise exception 'direction_invalid'; end if;
  result:=private.save_project_work_direction(p_project_id,p_input,p_expected_version);
  if p_input->>'intent'='save' then
    if p_input ? 'kind' then update public.project_work_directions set kind=v_kind where id=result; end if;
    if nullif(p_input->>'id','') is null and nullif(p_input->>'templateId','') is not null
      and exists(select 1 from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage where s.direction_id=result) then
      delete from public.project_task_stage_columns s where s.direction_id=result
        and not exists(select 1 from public.tasks t where t.project_id=s.project_id and t.stage=s.stage);
    end if;
  end if;
  return result;
end $$;

create function public.set_project_work_direction_status(p_project_id uuid,p_direction_id uuid,p_status text,p_expected_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare project public.projects; direction public.project_work_directions;
begin
  select * into project from public.projects where id=p_project_id for update;
  if auth.uid() is null or not coalesce(private.is_studio_admin(project.studio_id),false) then raise exception 'direction_not_admin'; end if;
  if project.status in ('completed','archived') or project.archived_at is not null then raise exception 'direction_read_only'; end if;
  if project.stage_configuration_version is distinct from p_expected_version then raise exception 'direction_version_conflict'; end if;
  select * into direction from public.project_work_directions where id=p_direction_id and project_id=p_project_id for update;
  if not found or p_status is null then raise exception 'direction_invalid'; end if;
  if direction.status=p_status then return; end if;
  if not((direction.status='planned' and p_status='active') or (direction.status='active' and p_status in ('paused','completed'))
    or (direction.status='paused' and p_status in ('active','planned','completed')) or (direction.status='completed' and p_status='active')) then
    raise exception 'direction_invalid_transition'; end if;
  if p_status='completed' and exists(select 1 from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage
    where s.direction_id=direction.id and s.kind='work' and s.deleted_at is null and t.status not in ('completed','cancelled')) then raise exception 'direction_open_tasks'; end if;
  if p_status='planned' and exists(select 1 from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage
    where s.direction_id=direction.id and s.kind='work' and t.status not in ('todo','cancelled')) then raise exception 'direction_progressed_tasks'; end if;
  update public.project_work_directions set status=p_status where id=direction.id;
  update public.projects set stage_configuration_version=stage_configuration_version+1 where id=project.id;
end $$;
revoke all on function public.set_project_work_direction_status(uuid,uuid,text,integer) from public,anon;
grant execute on function public.set_project_work_direction_status(uuid,uuid,text,integer) to authenticated;

-- Guard the actual task write boundary, including bulk, templates and direct API writes.
create function private.guard_direction_task_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_stage text; v_status text; v_kind text; completion_date_only boolean:=false;
begin
  if tg_op='DELETE' then v_project:=old.project_id; v_stage:=old.stage;
  else v_project:=new.project_id; v_stage:=new.stage; end if;
  perform 1 from public.projects where id=v_project for update;
  if tg_op='UPDATE' then
    completion_date_only:=new.completed_at is distinct from old.completed_at
      and (to_jsonb(new)-array['completed_at','updated_at'])=(to_jsonb(old)-array['completed_at','updated_at']);
    if (new.project_id,new.stage) is distinct from (old.project_id,old.stage) and exists(
      select 1 from public.project_task_stage_columns s join public.project_work_directions d on d.id=s.direction_id
      where s.project_id=old.project_id and s.stage=old.stage and s.kind='work' and d.status='completed') then
      raise exception 'direction_completed_read_only'; end if;
  end if;
  select d.status,s.kind into v_status,v_kind from public.project_task_stage_columns s
    join public.project_work_directions d on d.id=s.direction_id where s.project_id=v_project and s.stage=v_stage;
  if v_status='completed' and v_kind='work' and not completion_date_only then raise exception 'direction_completed_read_only'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.guard_direction_task_lifecycle() from public,anon,authenticated;
create trigger guard_direction_task_lifecycle before insert or update or delete on public.tasks
for each row execute function private.guard_direction_task_lifecycle();

create function private.start_direction_on_task_progress() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status not in ('todo','cancelled') then
    update public.project_work_directions d set status='active' from public.project_task_stage_columns s
    where s.project_id=new.project_id and s.stage=new.stage and s.direction_id=d.id and s.kind='work' and d.status='planned';
  end if;
  return new;
end $$;
revoke all on function private.start_direction_on_task_progress() from public,anon,authenticated;
create trigger start_direction_on_task_progress after insert or update of status on public.tasks
for each row execute function private.start_direction_on_task_progress();

notify pgrst,'reload schema';
