alter table public.project_task_stage_columns
  alter column enabled_statuses
  set default array['todo', 'in_progress', 'internal_review', 'review', 'completed']::text[];

update public.project_task_stage_columns
set enabled_statuses = array['todo', 'in_progress', 'internal_review', 'review', 'completed']::text[]
where enabled_statuses = array['todo', 'in_progress', 'review', 'completed']::text[];
