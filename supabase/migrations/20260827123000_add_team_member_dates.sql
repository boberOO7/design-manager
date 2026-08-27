-- The existing `studio_members.joined_at` stored the membership creation time.
-- Preserve that existing membership data while changing it to the nullable
-- calendar-date field used by the member editor. No values are inferred from
-- profile or account creation dates.
alter table public.studio_members
  alter column joined_at drop default,
  alter column joined_at type date using joined_at::date,
  alter column joined_at drop not null;

alter table public.profiles
  add column birth_date date;

drop function public.update_studio_member_profile(uuid, text, text, text);

create function public.update_studio_member_profile(
  p_user_id uuid,
  p_full_name text,
  p_job_title text,
  p_system_role text,
  p_joined_at date,
  p_birth_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_studio_id uuid;
  v_target_role text;
begin
  if p_full_name is null or btrim(p_full_name) = '' or length(btrim(p_full_name)) > 121 then
    raise exception 'A valid full name is required';
  end if;
  if p_job_title not in ('Designer', 'Architect') then
    raise exception 'A supported profession is required';
  end if;
  if p_system_role not in ('admin', 'employee') then
    raise exception 'A supported access role is required';
  end if;

  select sm.studio_id into v_studio_id
  from public.studio_members sm
  where sm.user_id = v_actor_id and sm.is_active and sm.system_role = 'admin';
  if v_studio_id is null then
    raise exception 'Only active studio administrators can edit team members';
  end if;
  if p_user_id = v_actor_id then
    raise exception 'Administrators cannot edit their own access through this form';
  end if;

  select sm.system_role into v_target_role
  from public.studio_members sm
  where sm.studio_id = v_studio_id and sm.user_id = p_user_id and sm.is_active
  for update;
  if v_target_role is null then
    raise exception 'Active studio member was not found';
  end if;

  perform 1
  from public.studio_members sm
  where sm.studio_id = v_studio_id and sm.is_active and sm.system_role = 'admin'
  for update;
  if v_target_role = 'admin' and p_system_role = 'employee' and (
    select count(*) from public.studio_members sm
    where sm.studio_id = v_studio_id and sm.is_active and sm.system_role = 'admin'
  ) <= 1 then
    raise exception 'The last active administrator cannot be demoted';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name), job_title = p_job_title, system_role = p_system_role, birth_date = p_birth_date
  where id = p_user_id and is_active;
  if not found then
    raise exception 'Active profile was not found';
  end if;

  update public.studio_members
  set system_role = p_system_role, joined_at = p_joined_at
  where studio_id = v_studio_id and user_id = p_user_id and is_active;
end;
$$;

revoke all on function public.update_studio_member_profile(uuid, text, text, text, date, date) from public, anon;
grant execute on function public.update_studio_member_profile(uuid, text, text, text, date, date) to authenticated;
