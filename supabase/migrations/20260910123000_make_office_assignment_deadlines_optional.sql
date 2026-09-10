-- Deadlines are optional in both Office Assignment forms.  Defaults let the
-- generated RPC contract represent that optional input without passing NULL
-- through a required generated argument.
create or replace function public.create_office_assignment(
  p_title text,
  p_description text,
  p_responsible_id uuid,
  p_priority text,
  p_deadline date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_studio_id uuid; v_id uuid;
begin
  select member.studio_id into v_studio_id
  from public.studio_members member
  join public.profiles profile on profile.id = member.user_id
  where member.user_id = v_actor and member.system_role = 'admin'
    and member.is_active and profile.is_active;
  if v_studio_id is null then raise exception 'admin_required'; end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid_priority'; end if;
  insert into public.office_assignments(studio_id, title, description, creator_id, responsible_id, priority, deadline)
  values (v_studio_id, btrim(p_title), nullif(btrim(p_description), ''), v_actor, p_responsible_id, p_priority, p_deadline)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.manage_office_assignment(
  p_assignment_id uuid,
  p_status public.office_assignment_status,
  p_responsible_id uuid,
  p_priority text,
  p_deadline date default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid;
begin
  select studio_id into v_studio_id from public.office_assignments where id = p_assignment_id for update;
  if v_studio_id is null or not private.is_studio_admin(v_studio_id) then raise exception 'admin_required'; end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid_priority'; end if;
  update public.office_assignments set status = p_status, responsible_id = p_responsible_id,
    priority = p_priority, deadline = p_deadline where id = p_assignment_id;
end;
$$;
