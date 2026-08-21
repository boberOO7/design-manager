-- Multiple templates may be active for a type; exactly one may be its default.
alter table public.project_templates add column is_default boolean not null default false;
drop function public.save_project_template(uuid, uuid, text, text, boolean, jsonb);
drop function public.create_project_from_template(jsonb, jsonb);
update public.project_templates set is_default = true where is_active;
drop index if exists public.project_templates_one_active_type_per_studio;
create unique index project_templates_one_default_type_per_studio on public.project_templates(studio_id, project_type) where is_default;

create or replace function public.save_project_template(p_template_id uuid, p_studio_id uuid, p_project_type text, p_name text, p_is_active boolean, p_is_default boolean, p_tasks jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_template_id uuid; normalized_name text := btrim(p_name);
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then raise exception 'Only studio administrators can manage project templates'; end if;
  if p_project_type not in ('private','commercial','horeca','medical','other') then raise exception 'Choose a valid project type'; end if;
  if char_length(normalized_name) not between 1 and 120 or jsonb_typeof(p_tasks) <> 'array' then raise exception 'Provide a valid template name and task list'; end if;
  if p_is_default and not p_is_active then raise exception 'A default template must be active'; end if;
  if exists (select 1 from jsonb_to_recordset(p_tasks) as task(stage text,title text,priority text) where task.stage not in ('stage_1','stage_2','stage_3','stage_4') or char_length(btrim(coalesce(task.title,''))) not between 1 and 200 or task.priority not in ('low','normal','high','urgent')) then raise exception 'Each template task needs a valid stage, title, and priority'; end if;
  if p_is_default then update public.project_templates set is_default = false where studio_id = p_studio_id and project_type = p_project_type and is_default and id is distinct from p_template_id; end if;
  if p_template_id is null then insert into public.project_templates (studio_id,project_type,name,is_active,is_default,created_by) values (p_studio_id,p_project_type,normalized_name,p_is_active,p_is_default,auth.uid()) returning id into saved_template_id;
  else update public.project_templates set project_type=p_project_type,name=normalized_name,is_active=p_is_active,is_default=p_is_default where id=p_template_id and studio_id=p_studio_id returning id into saved_template_id; if saved_template_id is null then raise exception 'Project template was not found'; end if; delete from public.project_template_tasks where template_id=saved_template_id; end if;
  insert into public.project_template_tasks(template_id,stage,title,priority,position) select saved_template_id,task.stage,btrim(task.title),task.priority,task.ordinality-1 from rows from (jsonb_to_recordset(p_tasks) as (stage text,title text,priority text)) with ordinality as task(stage,title,priority,ordinality) order by task.ordinality;
  if jsonb_array_length(p_tasks) <> (select count(*) from public.project_template_tasks where template_id=saved_template_id) then raise exception 'Template tasks could not be saved'; end if;
  return saved_template_id;
end; $$;

create or replace function public.create_project_from_template(p_project jsonb, p_stage_assignees jsonb default '[]'::jsonb, p_template_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_project_id uuid; current_studio_id uuid; project_type_value text; selected_template_id uuid; assignee record;
begin
  current_studio_id := (p_project->>'studio_id')::uuid;
  if current_studio_id is null or not coalesce(private.is_studio_admin(current_studio_id),false) then raise exception 'Only active studio administrators can create projects'; end if;
  if jsonb_typeof(p_stage_assignees)<>'array' or exists(select 1 from jsonb_to_recordset(p_stage_assignees) as a(stage text,assignee_id uuid) where a.stage not in ('stage_1','stage_2','stage_3','stage_4')) then raise exception 'Choose valid stage assignees'; end if;
  project_type_value:=nullif(p_project->>'project_type','');
  if p_template_id is not null then select id into selected_template_id from public.project_templates where id=p_template_id and studio_id=current_studio_id and project_type=project_type_value and is_active; if selected_template_id is null then raise exception 'Choose an active template matching this project type'; end if; end if;
  insert into public.projects(studio_id,created_by,name,project_type,project_type_custom,country_code,city,city_geonames_id,client_name,description,total_area_m2,status,priority,start_date,due_date) values(current_studio_id,auth.uid(),btrim(p_project->>'name'),project_type_value,case when project_type_value='other' then nullif(btrim(p_project->>'project_type_custom'),'') else null end,p_project->>'country_code',nullif(btrim(p_project->>'city'),''),nullif(p_project->>'city_geonames_id','')::integer,nullif(btrim(p_project->>'client_name'),''),nullif(p_project->>'description',''),(p_project->>'total_area_m2')::numeric,'planned',p_project->>'priority',(p_project->>'start_date')::date,nullif(p_project->>'due_date','')::date) returning id into new_project_id;
  if selected_template_id is null then return new_project_id; end if;
  for assignee in select distinct a.assignee_id from jsonb_to_recordset(p_stage_assignees) as a(stage text,assignee_id uuid) where a.assignee_id is not null loop
    if not exists(select 1 from public.studio_members sm join public.profiles p on p.id=sm.user_id where sm.studio_id=current_studio_id and sm.user_id=assignee.assignee_id and sm.is_active and p.is_active) then raise exception 'A selected assignee is not an active studio member'; end if;
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values(new_project_id,assignee.assignee_id,'other',0,current_date) on conflict(project_id,user_id) where is_active do nothing;
  end loop;
  insert into public.tasks(project_id,title,priority,assignee_id,created_by,stage,status) select new_project_id,t.title,t.priority,a.assignee_id,auth.uid(),t.stage,'todo' from public.project_template_tasks t left join jsonb_to_recordset(p_stage_assignees) as a(stage text,assignee_id uuid) on a.stage=t.stage where t.template_id=selected_template_id order by t.stage,t.position,t.id;
  return new_project_id;
end; $$;

revoke execute on function public.save_project_template(uuid,uuid,text,text,boolean,boolean,jsonb), public.create_project_from_template(jsonb,jsonb,uuid) from public,anon;
grant execute on function public.save_project_template(uuid,uuid,text,text,boolean,boolean,jsonb), public.create_project_from_template(jsonb,jsonb,uuid) to authenticated;
