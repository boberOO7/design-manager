-- Creation deliberately has no template ID. Keep required content and tenant
-- inputs first so that generated RPC types expose only the ID as optional.
drop function public.save_checklist_template(uuid, uuid, text, jsonb);
create function public.save_checklist_template(
  p_studio_id uuid, p_name text, p_stages jsonb, p_template_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_template_id uuid; normalized_name text := btrim(p_name);
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then raise exception 'Only studio administrators can save checklist templates'; end if;
  if char_length(normalized_name) not between 1 and 120 then raise exception 'Checklist template names must be between 1 and 120 characters'; end if;
  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then raise exception 'A checklist template needs at least one stage'; end if;
  if p_template_id is null then
    insert into public.checklist_templates (studio_id, name, created_by) values (p_studio_id, normalized_name, auth.uid()) returning id into saved_template_id;
  else
    update public.checklist_templates set name = normalized_name where id = p_template_id and studio_id = p_studio_id returning id into saved_template_id;
    if saved_template_id is null then raise exception 'Checklist template was not found'; end if;
    delete from public.checklist_template_items where template_id = saved_template_id;
  end if;
  insert into public.checklist_template_items (template_id, title, weight, position)
  select saved_template_id, btrim(item.title), item.weight, item.ordinality - 1
  from (select value ->> 'title' as title, (value ->> 'weight')::numeric as weight, ordinality from jsonb_array_elements(p_stages) with ordinality) as item
  where char_length(btrim(item.title)) between 1 and 200 and item.weight > 0 and item.weight <= 1000 and trunc(item.weight) = item.weight order by item.ordinality;
  if jsonb_array_length(p_stages) <> (select count(*) from public.checklist_template_items where template_id = saved_template_id) then raise exception 'Checklist stages must have a title and a whole-number weight from 1 to 1000'; end if;
  return saved_template_id;
exception when unique_violation then raise exception 'A checklist template with this name already exists' using errcode = 'unique_violation';
end;
$$;
revoke execute on function public.save_checklist_template(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.save_checklist_template(uuid, text, jsonb, uuid) to authenticated;

drop function public.save_project_template(uuid, uuid, text, text, boolean, boolean, jsonb);
create function public.save_project_template(
  p_studio_id uuid, p_project_type text, p_name text, p_is_active boolean, p_is_default boolean, p_tasks jsonb, p_template_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
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
end;
$$;
revoke execute on function public.save_project_template(uuid, text, text, boolean, boolean, jsonb, uuid) from public, anon;
grant execute on function public.save_project_template(uuid, text, text, boolean, boolean, jsonb, uuid) to authenticated;
