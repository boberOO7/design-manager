create or replace function public.create_task_with_checklist(
  p_task jsonb,
  p_checklist_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_task_id uuid;
begin
  insert into public.tasks (
    project_id, title, description, priority, assignee_id, created_by, due_date, completed_area_m2
  ) values (
    (p_task ->> 'project_id')::uuid,
    p_task ->> 'title',
    nullif(p_task ->> 'description', ''),
    p_task ->> 'priority',
    (p_task ->> 'assignee_id')::uuid,
    auth.uid(),
    nullif(p_task ->> 'due_date', '')::date,
    nullif(p_task ->> 'completed_area_m2', '')::numeric
  ) returning id into new_task_id;

  insert into public.task_checklist_items (task_id, title, weight, position)
  select new_task_id, item.title, item.weight, 0
  from (
    select value ->> 'title' as title,
      (value ->> 'weight')::numeric as weight,
      ordinality
    from jsonb_array_elements(p_checklist_items) with ordinality
  ) as item
  where char_length(btrim(item.title)) between 1 and 200
    and item.weight > 0
    and item.weight <= 1000
    and trunc(item.weight) = item.weight
  order by item.ordinality;

  if jsonb_array_length(p_checklist_items)
    <> (select count(*) from public.task_checklist_items where task_id = new_task_id) then
    raise exception 'Checklist items must have a title and a whole-number weight from 1 to 1000';
  end if;

  return new_task_id;
end;
$$;

revoke execute on function public.create_task_with_checklist(jsonb, jsonb) from public, anon;
grant execute on function public.create_task_with_checklist(jsonb, jsonb) to authenticated;
