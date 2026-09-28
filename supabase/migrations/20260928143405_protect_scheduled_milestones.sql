-- Manually added review milestones belong to the same unfinished schedule.
-- Move them with a delayed start, and reject dates before work can begin.
create or replace function private.validate_scheduled_milestone_date()
returns trigger language plpgsql security definer set search_path = '' as $$
declare first_workday date;
begin
  if new.target_status = 'completed' then return new; end if;
  select current_start into first_workday
  from public.task_schedules where task_id=new.task_id;
  if first_workday is not null and new.due_date < first_workday then
    raise exception 'Milestone deadline cannot precede scheduled work';
  end if;
  return new;
end;
$$;
revoke execute on function private.validate_scheduled_milestone_date() from public,anon,authenticated;
create trigger validate_scheduled_milestone_date
before insert or update of due_date,target_status on public.task_deadlines
for each row execute function private.validate_scheduled_milestone_date();

create or replace function private.shift_scheduled_task_milestones()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.current_start <= old.current_start then return new; end if;
  update public.task_deadlines
  set due_date=private.schedule_add_workdays(
    due_date,private.schedule_workdays_elapsed(old.current_start,new.current_start)
  )
  where task_id=new.task_id and target_status <> 'completed';
  return new;
end;
$$;
revoke execute on function private.shift_scheduled_task_milestones() from public,anon,authenticated;
create trigger shift_scheduled_task_milestones
after update of current_start on public.task_schedules
for each row when (new.current_start > old.current_start)
execute function private.shift_scheduled_task_milestones();
