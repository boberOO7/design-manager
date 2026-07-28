create or replace function private.create_notification(
  p_notification_type public.notification_type,
  p_studio_id uuid,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_href text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  bounded_title text;
  bounded_body text;
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then
    return;
  end if;

  if p_title is null or length(btrim(p_title)) = 0
    or p_body is null or length(btrim(p_body)) = 0
    or p_href !~ '^/[^/].*' then
    raise exception 'Invalid generated notification';
  end if;

  if not exists (
    select 1
    from public.studio_members as member
    inner join public.profiles as profile on profile.id = member.user_id
    where member.studio_id = p_studio_id
      and member.user_id = p_recipient_id
      and member.is_active
      and profile.is_active
  ) then
    return;
  end if;

  bounded_title := left(p_title, 160);
  bounded_body := left(p_body, 500);

  insert into public.notifications (
    studio_id,
    recipient_id,
    actor_id,
    notification_type,
    title,
    body,
    href,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_studio_id,
    p_recipient_id,
    p_actor_id,
    p_notification_type,
    bounded_title,
    bounded_body,
    p_href,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke execute on function private.create_notification(
  public.notification_type,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  jsonb
) from public, anon, authenticated;
