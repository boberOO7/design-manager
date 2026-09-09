create table public.crm_lead_history (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  lead_id uuid not null,
  event_type text not null check (event_type in ('created', 'status_changed')),
  actor_id uuid references public.profiles(id) on delete set null,
  previous_status public.crm_lead_status,
  new_status public.crm_lead_status,
  created_at timestamptz not null default now(),
  constraint crm_lead_history_lead_studio_fkey
    foreign key (lead_id, studio_id) references public.crm_leads(id, studio_id) on delete cascade,
  constraint crm_lead_history_event_shape_check check (
    (event_type = 'created' and previous_status is null and new_status is not null)
    or
    (event_type = 'status_changed' and previous_status is not null and new_status is not null and previous_status <> new_status)
  )
);

create index crm_lead_history_lead_created_idx
  on public.crm_lead_history (lead_id, created_at desc, id desc);
create index crm_lead_history_studio_idx
  on public.crm_lead_history (studio_id);

alter table public.crm_lead_history enable row level security;
revoke all on table public.crm_lead_history from anon, authenticated;
grant select on table public.crm_lead_history to authenticated;

create policy crm_lead_history_select_admin
on public.crm_lead_history
for select
to authenticated
using ((select private.is_active_crm_admin(studio_id)));

create or replace function private.log_crm_lead_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_lead_history (
      studio_id, lead_id, event_type, actor_id, new_status, created_at
    ) values (
      new.studio_id, new.id, 'created', (select auth.uid()), new.status, new.created_at
    );
  elsif new.status is distinct from old.status then
    insert into public.crm_lead_history (
      studio_id, lead_id, event_type, actor_id, previous_status, new_status
    ) values (
      new.studio_id, new.id, 'status_changed', (select auth.uid()), old.status, new.status
    );
  end if;
  return new;
end;
$$;
revoke execute on function private.log_crm_lead_history() from public, anon, authenticated;

create trigger log_crm_lead_history_after_write
after insert or update of status on public.crm_leads
for each row execute function private.log_crm_lead_history();

-- Existing leads predate this history foundation. Preserve their creation time
-- without inventing an actor who cannot be recovered from the source record.
insert into public.crm_lead_history (
  studio_id, lead_id, event_type, actor_id, new_status, created_at
)
select lead.studio_id, lead.id, 'created', null, lead.status, lead.created_at
from public.crm_leads as lead;

create unique index notifications_unread_crm_lead_follow_up_idx
  on public.notifications (entity_id)
  where notification_type = 'crm_lead_follow_up'
    and entity_type = 'crm_lead'
    and read_at is null;

create or replace function private.sync_crm_lead_follow_up_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder_at timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
    where notification_type = 'crm_lead_follow_up'
      and entity_type = 'crm_lead'
      and entity_id = old.id;
    return old;
  end if;

  if tg_op = 'UPDATE'
    and new.next_contact_date is not distinct from old.next_contact_date
    and new.responsible_admin_id is not distinct from old.responsible_admin_id
    and new.client_name is not distinct from old.client_name then
    return new;
  end if;

  delete from public.notifications
  where notification_type = 'crm_lead_follow_up'
    and entity_type = 'crm_lead'
    and entity_id = new.id
    and read_at is null;

  if new.next_contact_date is null or new.responsible_admin_id is null then
    return new;
  end if;

  reminder_at := (new.next_contact_date::timestamp + time '09:00') at time zone 'Europe/Kyiv';

  insert into public.notifications (
    studio_id, recipient_id, actor_id, notification_type, title, body, href,
    entity_type, entity_id, metadata, created_at
  ) values (
    new.studio_id, new.responsible_admin_id, null, 'crm_lead_follow_up',
    'Lead follow-up reminder', 'Reminder: contact ' || new.client_name || '.',
    '/crm/leads', 'crm_lead', new.id,
    jsonb_build_object('leadName', new.client_name, 'contactDate', new.next_contact_date),
    reminder_at
  );

  return new;
end;
$$;
revoke execute on function private.sync_crm_lead_follow_up_notification() from public, anon, authenticated;

create trigger sync_crm_lead_follow_up_notification_after_write
after insert or update of next_contact_date, responsible_admin_id, client_name or delete
on public.crm_leads
for each row execute function private.sync_crm_lead_follow_up_notification();
