-- Apply one ordered review sequence to a selected task batch in one transaction.
-- The canonical task review RPC keeps authorization, lifecycle and active-round guards.
create function public.bulk_configure_task_review(
  p_project_id uuid, p_stage text, p_task_ids uuid[], p_reviewer_ids uuid[]
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  project_studio_id uuid;
  selected_id uuid;
begin
  if p_stage is null or p_stage not in ('stage_1', 'stage_2', 'stage_3', 'stage_4')
    or coalesce(cardinality(p_task_ids), 0) = 0 or cardinality(p_task_ids) > 200
    or cardinality(p_task_ids) <> (select count(distinct task_id) from unnest(p_task_ids) as task_id)
    or p_reviewer_ids is null then raise exception 'Choose a non-empty unique task batch and reviewers'; end if;
  select studio_id into project_studio_id from public.projects where id = p_project_id;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id), false) then
    raise exception 'Only active studio administrators can configure task review';
  end if;
  perform 1 from public.tasks where project_id = p_project_id and id = any(p_task_ids) order by id for update;
  if (select count(*) from public.tasks where project_id = p_project_id and stage = p_stage and id = any(p_task_ids)) <> cardinality(p_task_ids) then
    raise exception 'Every selected task must still be available in this project stage';
  end if;
  foreach selected_id in array p_task_ids loop
    perform public.update_task_review(selected_id, 'configure', p_reviewer_ids => p_reviewer_ids);
  end loop;
end;
$$;
revoke execute on function public.bulk_configure_task_review(uuid, text, uuid[], uuid[]) from public, anon;
grant execute on function public.bulk_configure_task_review(uuid, text, uuid[], uuid[]) to authenticated;
notify pgrst, 'reload schema';
