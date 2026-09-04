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
  return new;
end;
$$;
revoke execute on function private.enforce_submission_write() from public, anon, authenticated;
