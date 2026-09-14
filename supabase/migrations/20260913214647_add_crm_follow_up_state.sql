create type public.crm_invalid_reason as enum (
  'not_submitted',
  'wrong_number',
  'spam',
  'duplicate',
  'other'
);

alter table public.crm_leads
  rename column next_contact_date to next_contact_at;

drop trigger sync_crm_lead_follow_up_notification_after_write on public.crm_leads;

alter table public.crm_leads
  alter column next_contact_at type timestamptz
    using ((next_contact_at::date::timestamp + time '09:00') at time zone 'Europe/Kyiv'),
  add column last_contacted_at timestamptz,
  add column invalid_reason public.crm_invalid_reason,
  add constraint crm_leads_invalid_reason_status check (
    invalid_reason is null or status = 'invalid'
  );

grant update (next_contact_at, last_contacted_at, invalid_reason)
on table public.crm_leads to authenticated;

create index crm_leads_studio_next_contact_idx
  on public.crm_leads (studio_id, next_contact_at)
  where next_contact_at is not null;

create or replace function private.normalize_crm_lead_invalid_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'invalid' then
    new.next_contact_at := null;
  else
    new.invalid_reason := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.normalize_crm_lead_invalid_state() from public, anon, authenticated;

create trigger normalize_crm_lead_invalid_state_before_write
before insert or update of status, next_contact_at, invalid_reason
on public.crm_leads
for each row execute function private.normalize_crm_lead_invalid_state();

create or replace function private.guard_crm_invalid_lead_project_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'invalid' and new.project_id is not null then
    raise exception 'An invalid lead cannot be converted to a project';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_crm_invalid_lead_project_link() from public, anon, authenticated;

create trigger guard_crm_invalid_lead_project_link_before_update
before update of project_id on public.crm_leads
for each row execute function private.guard_crm_invalid_lead_project_link();

create or replace function private.sync_crm_lead_follow_up_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
    where notification_type = 'crm_lead_follow_up'
      and entity_type = 'crm_lead'
      and entity_id = old.id;
    return old;
  end if;

  if tg_op = 'UPDATE'
    and new.next_contact_at is not distinct from old.next_contact_at
    and new.responsible_admin_id is not distinct from old.responsible_admin_id
    and new.client_name is not distinct from old.client_name then
    return new;
  end if;

  delete from public.notifications
  where notification_type = 'crm_lead_follow_up'
    and entity_type = 'crm_lead'
    and entity_id = new.id
    and read_at is null;

  if new.next_contact_at is null or new.responsible_admin_id is null then
    return new;
  end if;

  insert into public.notifications (
    studio_id, recipient_id, actor_id, notification_type, title, body, href,
    entity_type, entity_id, metadata, created_at
  ) values (
    new.studio_id, new.responsible_admin_id, null, 'crm_lead_follow_up',
    'Lead follow-up reminder', 'Reminder: contact ' || new.client_name || '.',
    '/crm/leads?lead=' || new.id, 'crm_lead', new.id,
    jsonb_build_object('leadName', new.client_name, 'contactAt', new.next_contact_at),
    new.next_contact_at
  );

  return new;
end;
$$;

create trigger sync_crm_lead_follow_up_notification_after_write
after insert or update of next_contact_at, responsible_admin_id, client_name or delete
on public.crm_leads
for each row execute function private.sync_crm_lead_follow_up_notification();
