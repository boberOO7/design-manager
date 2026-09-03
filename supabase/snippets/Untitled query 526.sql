delete from public.task_deadlines
where target_status = 'in_progress';

alter table public.task_deadlines
  drop constraint if exists task_deadlines_target_status_check;

alter table public.task_deadlines
  add constraint task_deadlines_target_status_check
  check (
    target_status in (
      'internal_review',
      'review',
      'completed'
    )
  );