-- Notification copy is localized at render time. Keep the stored English copy as
-- a backwards-compatible fallback, and persist the semantic values separately.

create or replace function private.notify_time_off_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  recipient uuid;
  notification_kind public.notification_type;
  requester_name text;
  request_label text := initcap(replace(new.request_type::text, '_', ' '));
  notification_metadata jsonb;
begin
  select profile.full_name into requester_name
  from public.profiles as profile
  where profile.id = new.user_id;

  notification_metadata := jsonb_build_object(
    'requestType', new.request_type,
    'startDate', new.start_date,
    'endDate', new.end_date,
    'requesterName', requester_name
  );

  if tg_op = 'INSERT' and new.status = 'pending' then
    actor := (select auth.uid());
    for recipient in
      select distinct member.user_id
      from public.studio_members as member
      inner join public.profiles as profile on profile.id = member.user_id
      where member.studio_id = new.studio_id
        and member.is_active = true
        and profile.is_active = true
        and member.system_role = 'admin'
    loop
      perform private.create_notification(
        'time_off_request_submitted',
        new.studio_id,
        recipient,
        actor,
        'New time-off request',
        requester_name || ' requested ' || request_label || ' for ' || to_char(new.start_date, 'Mon FMDD')
          || case when new.end_date <> new.start_date then '–' || to_char(new.end_date, 'Mon FMDD') else '' end || '.',
        '/admin?request=' || new.id,
        'time_off_request',
        new.id,
        notification_metadata
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    actor := new.reviewed_by;
    notification_kind := case
      when new.status = 'approved' then 'time_off_request_approved'::public.notification_type
      else 'time_off_request_rejected'::public.notification_type
    end;

    perform private.create_notification(
      notification_kind,
      new.studio_id,
      new.user_id,
      actor,
      case when new.status = 'approved' then 'Time off approved' else 'Time off rejected' end,
      request_label || ' request for ' || to_char(new.start_date, 'Mon FMDD')
        || case when new.end_date <> new.start_date then '–' || to_char(new.end_date, 'Mon FMDD') else '' end || '.',
      '/calendar?request=' || new.id || '&date=' || new.start_date,
      'time_off_request',
      new.id,
      notification_metadata
    );
  elsif tg_op = 'UPDATE'
    and old.status in ('pending', 'approved', 'rejected')
    and new.status = 'cancelled' then
    actor := (select auth.uid());
    perform private.create_notification(
      'time_off_request_cancelled',
      new.studio_id,
      new.user_id,
      actor,
      'Time off cancelled',
      request_label || ' request for ' || to_char(new.start_date, 'Mon FMDD') || ' was cancelled.',
      '/calendar?request=' || new.id || '&date=' || new.start_date,
      'time_off_request',
      new.id,
      notification_metadata
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.notify_time_off_request()
from public, anon, authenticated;


create or replace function private.notify_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  project_studio_id uuid;
  project_name text;
  change_label text;
  change_kind text;
begin
  select project.name, project.studio_id into project_name, project_studio_id
  from public.projects as project where project.id = new.project_id;

  if tg_op = 'INSERT' then
    perform private.create_notification('task_assigned', project_studio_id, new.assignee_id, actor,
      'New task assigned', 'You were assigned “' || new.title || '” in ' || project_name || '.',
      '/projects/' || new.project_id || '?task=' || new.id, 'task', new.id,
      jsonb_build_object('subject', new.title, 'projectName', project_name, 'assignmentKind', 'primary'));
  elsif tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
    perform private.create_notification('task_assigned', project_studio_id, new.assignee_id, actor,
      'New task assigned', 'You were assigned “' || new.title || '” in ' || project_name || '.',
      '/projects/' || new.project_id || '?task=' || new.id, 'task', new.id,
      jsonb_build_object('subject', new.title, 'projectName', project_name, 'assignmentKind', 'primary'));
  elsif tg_op = 'UPDATE' and new.assignee_id is distinct from actor
    and (new.due_date is distinct from old.due_date or new.priority is distinct from old.priority) then
    change_kind := case
      when new.due_date is distinct from old.due_date and new.priority is distinct from old.priority then 'priority_and_due_date'
      when new.due_date is distinct from old.due_date then 'due_date'
      else 'priority'
    end;
    change_label := case
      when change_kind = 'priority_and_due_date' then 'Priority and due date changed for “' || new.title || '”.'
      when change_kind = 'due_date' then 'The due date for “' || new.title || '” changed' || case when new.due_date is null then '.' else ' to ' || to_char(new.due_date, 'Mon FMDD') || '.' end
      else 'Priority changed for “' || new.title || '”.'
    end;
    perform private.create_notification('task_details_changed', project_studio_id, new.assignee_id, actor,
      'Task details changed', change_label, '/projects/' || new.project_id || '?task=' || new.id, 'task', new.id,
      jsonb_build_object('subject', new.title, 'projectName', project_name, 'change', change_kind, 'dueDate', new.due_date));
  end if;
  return new;
end;
$$;

revoke execute on function private.notify_task_change() from public, anon, authenticated;


create or replace function private.notify_task_collaborator_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  task_title text;
  task_project_id uuid;
  project_name text;
  project_studio_id uuid;
begin
  select task.title, task.project_id, project.name, project.studio_id
  into task_title, task_project_id, project_name, project_studio_id
  from public.tasks as task
  inner join public.projects as project on project.id = task.project_id
  where task.id = new.task_id;

  perform private.create_notification(
    'task_assigned', project_studio_id, new.user_id, actor,
    'New task assigned', 'You were added to “' || task_title || '” in ' || project_name || '.',
    '/projects/' || task_project_id || '?task=' || new.task_id, 'task', new.task_id,
    jsonb_build_object('subject', task_title, 'projectName', project_name, 'assignmentKind', 'collaborator')
  );

  return new;
end;
$$;

revoke execute on function private.notify_task_collaborator_change()
from public, anon, authenticated;


create or replace function private.notify_task_collaborators_of_details_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  recipient uuid;
  project_name text;
  project_studio_id uuid;
  change_label text;
  change_kind text;
begin
  if new.due_date is not distinct from old.due_date
     and new.priority is not distinct from old.priority then
    return new;
  end if;

  select project.name, project.studio_id into project_name, project_studio_id
  from public.projects as project
  where project.id = new.project_id;

  change_kind := case
    when new.due_date is distinct from old.due_date and new.priority is distinct from old.priority then 'priority_and_due_date'
    when new.due_date is distinct from old.due_date then 'due_date'
    else 'priority'
  end;
  change_label := case
    when change_kind = 'priority_and_due_date' then 'Priority and due date changed for “' || new.title || '”.'
    when change_kind = 'due_date' then 'The due date for “' || new.title || '” changed' || case when new.due_date is null then '.' else ' to ' || to_char(new.due_date, 'Mon FMDD') || '.' end
    else 'Priority changed for “' || new.title || '”.'
  end;

  for recipient in
    select distinct collaborator.user_id
    from public.task_collaborators as collaborator
    where collaborator.task_id = new.id
  loop
    perform private.create_notification(
      'task_details_changed', project_studio_id, recipient, actor,
      'Task details changed', change_label,
      '/projects/' || new.project_id || '?task=' || new.id, 'task', new.id,
      jsonb_build_object('subject', new.title, 'projectName', project_name, 'change', change_kind, 'dueDate', new.due_date)
    );
  end loop;

  return new;
end;
$$;

revoke execute on function private.notify_task_collaborators_of_details_change()
from public, anon, authenticated;


create or replace function private.notify_site_visit_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if new.event_type = 'site_visit' and new.assignee_id is not null and new.assignee_id <> new.organizer_id and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform private.create_notification('calendar_event_assigned', new.studio_id, new.assignee_id, actor, new.title, 'Site visit assignment',
      '/calendar?event=' || new.id || '&date=' || (new.starts_at at time zone 'Europe/Kyiv')::date, 'calendar_event', new.id,
      jsonb_build_object('eventTitle', new.title, 'startsAt', new.starts_at, 'projectId', new.project_id, 'location', new.location, 'organizerId', new.organizer_id));
  end if;
  return new;
end;
$$;

revoke execute on function private.notify_site_visit_assignment() from public, anon, authenticated;


create or replace function private.notify_office_assignment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform private.create_notification('office_assignment_assigned', new.studio_id, new.responsible_id, new.creator_id,
      'New office assignment', 'You are responsible for “' || new.title || '”.',
      '/office/assignments?item=' || new.id, 'office_assignment', new.id,
      jsonb_build_object('subject', new.title, 'status', new.status, 'priority', new.priority));
  elsif new.status is distinct from old.status then
    perform private.create_notification('office_assignment_status_changed', new.studio_id, new.creator_id, actor,
      'Office assignment updated', '“' || new.title || '” is now ' || replace(new.status::text, '_', ' ') || '.',
      '/office/assignments?item=' || new.id, 'office_assignment', new.id,
      jsonb_build_object('subject', new.title, 'status', new.status));
    if new.responsible_id is distinct from old.responsible_id then
      perform private.create_notification('office_assignment_assigned', new.studio_id, new.responsible_id, actor,
        'New office assignment', 'You are responsible for “' || new.title || '”.',
        '/office/assignments?item=' || new.id, 'office_assignment', new.id,
        jsonb_build_object('subject', new.title, 'status', new.status, 'priority', new.priority));
    end if;
  elsif new.responsible_id is distinct from old.responsible_id then
    perform private.create_notification('office_assignment_assigned', new.studio_id, new.responsible_id, actor,
      'New office assignment', 'You are responsible for “' || new.title || '”.',
      '/office/assignments?item=' || new.id, 'office_assignment', new.id,
      jsonb_build_object('subject', new.title, 'status', new.status, 'priority', new.priority));
  end if;
  return new;
end;
$$;

revoke execute on function private.notify_office_assignment_change() from public, anon, authenticated;


create or replace function private.notify_submission_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; actor uuid := (select auth.uid()); author_label text;
begin
  if tg_op = 'INSERT' and new.type in ('request', 'complaint') then
    author_label := case when new.is_anonymous then 'Anonymous' else coalesce((select full_name from public.profiles where id = new.author_id), 'A studio member') end;
    for recipient in select member.user_id from public.studio_members member join public.profiles profile on profile.id = member.user_id
      where member.studio_id = new.studio_id and member.system_role = 'admin' and member.is_active and profile.is_active
    loop
      perform private.create_notification('submission_created', new.studio_id, recipient,
        case when new.is_anonymous then null else new.author_id end,
        case when new.type = 'request' then 'New request' else 'New complaint' end,
        author_label || ': “' || new.title || '”', '/office/submissions?item=' || new.id,
        'submission', new.id, jsonb_build_object(
          'type', new.type, 'anonymous', new.is_anonymous, 'authorName', case when new.is_anonymous then null else author_label end, 'subject', new.title
        ));
    end loop;
  elsif tg_op = 'UPDATE' then
    if new.responsible_id is distinct from old.responsible_id and new.responsible_id is not null then
      perform private.create_notification('submission_assigned', new.studio_id, new.responsible_id, actor,
        'New request assigned', 'You are responsible for “' || new.title || '”.',
        '/office/submissions?item=' || new.id, 'submission', new.id,
        jsonb_build_object('type', new.type, 'subject', new.title));
    end if;
    if new.status is distinct from old.status and new.author_id is not null then
      perform private.create_notification('submission_status_changed', new.studio_id, new.author_id, actor,
        'Submission updated', '“' || new.title || '” is now ' || replace(new.status::text, '_', ' ') || '.',
        '/office/submissions?item=' || new.id, 'submission', new.id,
        jsonb_build_object('type', new.type, 'status', new.status, 'subject', new.title));
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.notify_submission_change() from public, anon, authenticated;
