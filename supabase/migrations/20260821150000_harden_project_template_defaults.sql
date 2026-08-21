alter table public.project_templates
  add constraint project_templates_default_requires_active
  check (not is_default or is_active);

create or replace function public.create_project_from_template(p_project jsonb, p_stage_assignees jsonb default '[]'::jsonb, p_template_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_project_id uuid; current_studio_id uuid; project_type_value text; selected_template_id uuid; assignee record;
begin
  current_studio_id := (p_project->>'studio_id')::uuid;
  if current_studio_id is null or not coalesce(private.is_studio_admin(current_studio_id),false) then raise exception 'Only active studio administrators can create projects'; end if;
  if jsonb_typeof(p_stage_assignees)<>'array' or exists(select 1 from jsonb_to_recordset(p_stage_assignees) as a(stage text,assignee_id uuid) where a.stage not in ('stage_1','stage_2','stage_3','stage_4')) then raise exception 'Choose valid stage assignees'; end if;
  if (select count(*) from jsonb_to_recordset(p_stage_assignees) as a(stage text,assignee_id uuid)) <> (select count(distinct stage) from jsonb_to_recordset(p_stage_assignees) as a(stage text,assignee_id uuid)) then raise exception 'Choose only one assignee per stage'; end if;
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
