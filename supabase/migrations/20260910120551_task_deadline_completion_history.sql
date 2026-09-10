create table public.task_deadline_completions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  project_id uuid not null,
  task_id uuid not null,
  assignee_id uuid,
  target_status text not null check (target_status in ('internal_review', 'review', 'completed')),
  due_date date not null,
  completed_at timestamptz not null default now(),
  completed_on date not null default ((now() at time zone 'Europe/Kyiv')::date),
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index task_deadline_completions_active_milestone_idx
on public.task_deadline_completions (task_id, target_status)
where voided_at is null;
create index task_deadline_completions_studio_completed_idx
on public.task_deadline_completions (studio_id, completed_at)
where voided_at is null;

alter table public.task_deadline_completions enable row level security;
revoke all on table public.task_deadline_completions from anon, authenticated;
grant select on table public.task_deadline_completions to authenticated;
create policy "task_deadline_completions_select_for_active_studio_members"
on public.task_deadline_completions for select to authenticated
using ((select private.is_studio_member(studio_id)));

create or replace function private.record_task_deadline_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  milestone text;
  milestone_order integer;
  old_order integer;
  new_order integer;
  task_studio_id uuid;
begin
  old_order := case old.status when 'todo' then 0 when 'in_progress' then 1 when 'internal_review' then 2 when 'review' then 3 when 'completed' then 4 else -1 end;
  new_order := case new.status when 'todo' then 0 when 'in_progress' then 1 when 'internal_review' then 2 when 'review' then 3 when 'completed' then 4 else -1 end;
  if new_order = old_order then return new; end if;

  select studio_id into task_studio_id from public.projects where id = new.project_id;
  if task_studio_id is null then raise exception 'Task project no longer exists'; end if;

  update public.task_deadline_completions
  set voided_at = now()
  where task_id = new.id
    and voided_at is null
    and (case target_status when 'internal_review' then 2 when 'review' then 3 when 'completed' then 4 end) > new_order;

  for milestone, milestone_order in
    select deadline.target_status, case deadline.target_status when 'internal_review' then 2 when 'review' then 3 when 'completed' then 4 end
    from public.task_deadlines as deadline
    where deadline.task_id = new.id
  loop
    if milestone_order > old_order and milestone_order <= new_order then
      insert into public.task_deadline_completions (studio_id, project_id, task_id, assignee_id, target_status, due_date)
      select task_studio_id, new.project_id, new.id, new.assignee_id, deadline.target_status, deadline.due_date
      from public.task_deadlines as deadline
      where deadline.task_id = new.id and deadline.target_status = milestone;
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function private.record_task_deadline_completion() from public, anon, authenticated;

create trigger record_task_deadline_completion_after_status_change
after update of status on public.tasks
for each row execute function private.record_task_deadline_completion();
