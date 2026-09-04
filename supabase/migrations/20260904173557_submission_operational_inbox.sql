update public.submissions
set priority = 'normal'
where priority is null;

alter table public.submissions
  alter column priority set default 'normal',
  alter column priority set not null;

create or replace function private.submission_transition_is_valid(
  p_type public.submission_type,
  p_old public.submission_status,
  p_new public.submission_status
) returns boolean language sql immutable set search_path = '' as $$
  select p_old = p_new or case p_type
    when 'request' then (p_old, p_new) in (('new','accepted'),('accepted','in_progress'),('in_progress','done'),('new','rejected'),('accepted','rejected'),('in_progress','rejected'))
    when 'suggestion' then (p_old, p_new) in (('new','discussion'),('new','accepted'),('discussion','accepted'),('accepted','planned'),('planned','implemented'),('new','rejected'),('discussion','rejected'),('accepted','rejected'),('planned','rejected'))
    when 'complaint' then (p_old, p_new) in (('new','reviewing'),('reviewing','action_taken'),('action_taken','closed'))
  end;
$$;

create or replace function private.enforce_submission_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.submission_status_is_valid(new.type, new.status) then
    raise exception 'invalid_submission_status';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.studio_id is distinct from old.studio_id
      or new.type is distinct from old.type or new.title is distinct from old.title
      or new.description is distinct from old.description or new.author_id is distinct from old.author_id
      or new.is_anonymous is distinct from old.is_anonymous or new.created_at is distinct from old.created_at then
      raise exception 'submission_identity_is_immutable';
    end if;
    if not private.submission_transition_is_valid(old.type, old.status, new.status) then
      raise exception 'invalid_submission_transition';
    end if;
  end if;
  if new.responsible_id is not null and not exists (
    select 1 from public.studio_members member join public.profiles profile on profile.id = member.user_id
    where member.studio_id = new.studio_id and member.user_id = new.responsible_id
      and member.is_active and profile.is_active
  ) then raise exception 'responsible_must_be_active_studio_member'; end if;
  if new.type = 'complaint' and new.responsible_id is not null then
    raise exception 'complaints_do_not_expose_responsible_participants';
  end if;
  if new.type = 'request' and new.status = 'in_progress' and new.responsible_id is null then
    raise exception 'responsible_required_for_work';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_submission_write() from public, anon, authenticated;

create or replace function public.manage_submission(
  p_submission_id uuid,
  p_status public.submission_status,
  p_responsible_id uuid,
  p_priority text,
  p_deadline date,
  p_internal_note text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid;
begin
  select studio_id into v_studio_id from public.submissions where id = p_submission_id for update;
  if v_studio_id is null or not private.is_studio_admin(v_studio_id) then raise exception 'admin_required'; end if;
  if p_priority is not null and p_priority not in ('low','normal','high','urgent') then raise exception 'invalid_priority'; end if;
  update public.submissions set status = p_status, responsible_id = p_responsible_id,
    priority = coalesce(p_priority, 'normal'), deadline = p_deadline where id = p_submission_id;
  insert into public.submission_admin_details(submission_id, studio_id, internal_note)
  values (p_submission_id, v_studio_id, nullif(btrim(p_internal_note), ''))
  on conflict (submission_id) do update set internal_note = excluded.internal_note;
end;
$$;
revoke all on function public.manage_submission(uuid, public.submission_status, uuid, text, date, text) from public, anon;
grant execute on function public.manage_submission(uuid, public.submission_status, uuid, text, date, text) to authenticated;
