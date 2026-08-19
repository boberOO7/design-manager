-- create_task_with_checklist is SECURITY INVOKER and explicitly writes status.
-- Keep task writes column-scoped; RLS remains the authorization boundary.
grant insert (status) on table public.tasks to authenticated;
