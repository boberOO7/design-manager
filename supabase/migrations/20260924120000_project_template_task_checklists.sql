alter table public.project_template_tasks
  add column checklist_template_id uuid references public.checklist_templates(id) on delete set null;

create or replace function public.save_project_template(
  p_studio_id uuid, p_project_type text, p_name text, p_is_active boolean,
  p_is_default boolean, p_tasks jsonb, p_template_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved_template_id uuid;
  normalized_name text := btrim(p_name);
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then raise exception 'Only studio administrators can manage project templates'; end if;
  if p_project_type not in ('private','commercial','horeca','medical','other') then raise exception 'Choose a valid project type'; end if;
  if char_length(normalized_name) not between 1 and 120 or jsonb_typeof(p_tasks) <> 'array' then raise exception 'Provide a valid template name and task list'; end if;
  if p_is_default and not p_is_active then raise exception 'A default template must be active'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_tasks) as task(stage text, title text, priority text, checklist_template_id uuid)
    where task.stage not in ('stage_1','stage_2','stage_3','stage_4')
      or char_length(btrim(coalesce(task.title,''))) not between 1 and 200
      or task.priority not in ('low','normal','high','urgent')
      or (task.checklist_template_id is not null and not exists (
        select 1 from public.checklist_templates as checklist
        where checklist.id = task.checklist_template_id and checklist.studio_id = p_studio_id
      ))
  ) then raise exception 'Each template task needs a valid stage, title, priority, and checklist template'; end if;
  if p_is_default then update public.project_templates set is_default = false where studio_id = p_studio_id and project_type = p_project_type and is_default and id is distinct from p_template_id; end if;
  if p_template_id is null then
    insert into public.project_templates (studio_id,project_type,name,is_active,is_default,created_by)
    values (p_studio_id,p_project_type,normalized_name,p_is_active,p_is_default,auth.uid()) returning id into saved_template_id;
  else
    update public.project_templates set project_type=p_project_type,name=normalized_name,is_active=p_is_active,is_default=p_is_default
    where id=p_template_id and studio_id=p_studio_id returning id into saved_template_id;
    if saved_template_id is null then raise exception 'Project template was not found'; end if;
    delete from public.project_template_tasks where template_id=saved_template_id;
  end if;
  insert into public.project_template_tasks(template_id,stage,title,priority,position,checklist_template_id)
  select saved_template_id,task.stage,btrim(task.title),task.priority,task.ordinality-1,task.checklist_template_id
  from rows from (jsonb_to_recordset(p_tasks) as (stage text,title text,priority text,checklist_template_id uuid))
    with ordinality as task(stage,title,priority,checklist_template_id,ordinality)
  order by task.ordinality;
  if jsonb_array_length(p_tasks) <> (select count(*) from public.project_template_tasks where template_id=saved_template_id) then raise exception 'Template tasks could not be saved'; end if;
  return saved_template_id;
end;
$$;

create or replace function private.copy_project_template_stage_tasks(
  p_project_id uuid, p_template_id uuid, p_source_stage text,
  p_destination_stage text, p_assignee_id uuid default null
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  template_task record;
  new_task_id uuid;
  copied_count integer := 0;
begin
  for template_task in
    select id, title, checklist_template_id
    from public.project_template_tasks
    where template_id = p_template_id and stage = p_source_stage
    order by position, id
  loop
    insert into public.tasks (project_id,title,priority,assignee_id,created_by,stage,status)
    values (p_project_id,template_task.title,'normal',p_assignee_id,auth.uid(),p_destination_stage,'todo')
    returning id into new_task_id;

    insert into public.task_checklist_items (task_id,title,weight,position)
    select new_task_id,item.title,item.weight,item.position
    from public.checklist_template_items as item
    where item.template_id = template_task.checklist_template_id
    order by item.position,item.id;
    copied_count := copied_count + 1;
  end loop;
  return copied_count;
end;
$$;
