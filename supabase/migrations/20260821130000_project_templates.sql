-- Studio-scoped project task templates and an atomic project creation path.
create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  project_type text not null check (project_type in ('private', 'commercial', 'horeca', 'medical', 'other')),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_templates(id) on delete cascade,
  stage text not null check (stage in ('stage_1', 'stage_2', 'stage_3', 'stage_4')),
  title text not null check (title = btrim(title) and char_length(title) between 1 and 200),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  position integer not null check (position between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, stage, position)
);

create unique index project_templates_one_active_type_per_studio
  on public.project_templates(studio_id, project_type) where is_active;
create index project_template_tasks_deterministic_order
  on public.project_template_tasks(template_id, stage, position, id);

create trigger set_project_templates_updated_at before update on public.project_templates
  for each row execute function public.set_updated_at();
create trigger set_project_template_tasks_updated_at before update on public.project_template_tasks
  for each row execute function public.set_updated_at();

alter table public.project_templates enable row level security;
alter table public.project_template_tasks enable row level security;
revoke all on public.project_templates, public.project_template_tasks from anon, authenticated;
grant select on public.project_templates, public.project_template_tasks to authenticated;

create policy "project_templates_select_for_active_studio_members"
on public.project_templates for select to authenticated
using ((select private.is_studio_member(studio_id)));
create policy "project_template_tasks_select_for_active_studio_members"
on public.project_template_tasks for select to authenticated
using (exists (
  select 1 from public.project_templates template
  where template.id = template_id and private.is_studio_member(template.studio_id)
));

create or replace function public.save_project_template(
  p_template_id uuid,
  p_studio_id uuid,
  p_project_type text,
  p_name text,
  p_is_active boolean,
  p_tasks jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved_template_id uuid; normalized_name text := btrim(p_name); task_count integer;
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then raise exception 'Only studio administrators can manage project templates'; end if;
  if p_project_type not in ('private', 'commercial', 'horeca', 'medical', 'other') then raise exception 'Choose a valid project type'; end if;
  if char_length(normalized_name) not between 1 and 120 then raise exception 'Template names must be between 1 and 120 characters'; end if;
  if jsonb_typeof(p_tasks) <> 'array' then raise exception 'Template tasks must be a list'; end if;
  if exists (select 1 from jsonb_to_recordset(p_tasks) as task(stage text, title text, priority text) where task.stage not in ('stage_1','stage_2','stage_3','stage_4') or char_length(btrim(coalesce(task.title, ''))) not between 1 and 200 or task.priority not in ('low','normal','high','urgent')) then
    raise exception 'Each template task needs a valid stage, title, and priority';
  end if;
  if p_template_id is null then
    insert into public.project_templates (studio_id, project_type, name, is_active, created_by)
    values (p_studio_id, p_project_type, normalized_name, p_is_active, auth.uid()) returning id into saved_template_id;
  else
    update public.project_templates set project_type = p_project_type, name = normalized_name, is_active = p_is_active
    where id = p_template_id and studio_id = p_studio_id returning id into saved_template_id;
    if saved_template_id is null then raise exception 'Project template was not found'; end if;
    delete from public.project_template_tasks where template_id = saved_template_id;
  end if;
  insert into public.project_template_tasks (
    template_id,
    stage,
    title,
    priority,
    position
  )
  select
    saved_template_id,
    task.stage,
    btrim(task.title),
    task.priority,
    task.ordinality - 1
  from rows from (
    jsonb_to_recordset(p_tasks)
      as (stage text, title text, priority text)
  ) with ordinality
    as task(stage, title, priority, ordinality)
  order by task.ordinality;
  select count(*) into task_count from public.project_template_tasks where template_id = saved_template_id;
  if task_count <> jsonb_array_length(p_tasks) then raise exception 'Template tasks could not be saved'; end if;
  return saved_template_id;
exception when unique_violation then raise exception 'This project type already has an active default template' using errcode = 'unique_violation';
end; $$;

create or replace function public.delete_project_template(p_template_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_studio_id uuid;
begin
  select studio_id into target_studio_id from public.project_templates where id = p_template_id;
  if target_studio_id is null then raise exception 'Project template was not found'; end if;
  if not coalesce(private.is_studio_admin(target_studio_id), false) then raise exception 'Only studio administrators can manage project templates'; end if;
  delete from public.project_templates where id = p_template_id;
end; $$;

create or replace function public.create_project_from_template(p_project jsonb, p_stage_assignees jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_project_id uuid; current_studio_id uuid; project_type_value text; matched_template_id uuid; assignee record;
begin
  current_studio_id := (p_project ->> 'studio_id')::uuid;
  if current_studio_id is null or not coalesce(private.is_studio_admin(current_studio_id), false) then raise exception 'Only active studio administrators can create projects'; end if;
  if jsonb_typeof(p_stage_assignees) <> 'array' or exists (select 1 from jsonb_to_recordset(p_stage_assignees) as a(stage text, assignee_id uuid) where a.stage not in ('stage_1','stage_2','stage_3','stage_4')) then raise exception 'Choose valid stage assignees'; end if;
  if (select count(*) from jsonb_to_recordset(p_stage_assignees) as a(stage text, assignee_id uuid)) <> (select count(distinct stage) from jsonb_to_recordset(p_stage_assignees) as a(stage text, assignee_id uuid)) then raise exception 'Choose only one assignee per stage'; end if;
  if exists (select 1 from jsonb_to_recordset(p_stage_assignees) as a(stage text, assignee_id uuid) where a.assignee_id is not null and not exists (select 1 from public.studio_members sm join public.profiles profile on profile.id = sm.user_id where sm.studio_id = current_studio_id and sm.user_id = a.assignee_id and sm.is_active and profile.is_active)) then raise exception 'A selected assignee is not an active studio member'; end if;
  project_type_value := nullif(p_project ->> 'project_type', '');
  if project_type_value is not null and project_type_value not in ('private','commercial','horeca','medical','other') then raise exception 'Choose a valid project type'; end if;
  insert into public.projects (studio_id, created_by, name, project_type, project_type_custom, country_code, city, city_geonames_id, client_name, description, total_area_m2, status, priority, start_date, due_date)
  values (current_studio_id, auth.uid(), btrim(p_project ->> 'name'), project_type_value, case when project_type_value = 'other' then nullif(btrim(p_project ->> 'project_type_custom'), '') else null end, p_project ->> 'country_code', nullif(btrim(p_project ->> 'city'), ''), nullif(p_project ->> 'city_geonames_id', '')::integer, nullif(btrim(p_project ->> 'client_name'), ''), nullif(p_project ->> 'description', ''), (p_project ->> 'total_area_m2')::numeric, 'planned', p_project ->> 'priority', (p_project ->> 'start_date')::date, nullif(p_project ->> 'due_date', '')::date) returning id into new_project_id;
  select id into matched_template_id from public.project_templates where studio_id = current_studio_id and project_type = project_type_value and is_active;
  if matched_template_id is null then return new_project_id; end if;
  for assignee in select distinct a.assignee_id from jsonb_to_recordset(p_stage_assignees) as a(stage text, assignee_id uuid) where a.assignee_id is not null loop
    insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at)
    values (new_project_id, assignee.assignee_id, 'other', 0, current_date)
    on conflict (project_id, user_id) where is_active do nothing;
  end loop;
  insert into public.tasks (project_id, title, priority, assignee_id, created_by, stage, status)
  select new_project_id, task.title, task.priority, assignment.assignee_id, auth.uid(), task.stage, 'todo'
  from public.project_template_tasks task
  left join jsonb_to_recordset(p_stage_assignees) as assignment(stage text, assignee_id uuid) on assignment.stage = task.stage
  where task.template_id = matched_template_id
  order by task.stage, task.position, task.id;
  return new_project_id;
end; $$;

revoke execute on function public.save_project_template(uuid, uuid, text, text, boolean, jsonb), public.delete_project_template(uuid), public.create_project_from_template(jsonb, jsonb) from public, anon;
grant execute on function public.save_project_template(uuid, uuid, text, text, boolean, jsonb), public.delete_project_template(uuid), public.create_project_from_template(jsonb, jsonb) to authenticated;
