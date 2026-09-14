alter table public.profiles
  add column notification_popups_enabled boolean not null default true,
  add column notification_sound_enabled boolean not null default true;

drop function public.update_my_profile_details(date, text, text, bigint, date);

create function public.update_my_profile_details(
  p_birth_date date default null,
  p_country_code text default null,
  p_city text default null,
  p_city_geonames_id bigint default null,
  p_joined_at date default null,
  p_notification_popups_enabled boolean default null,
  p_notification_sound_enabled boolean default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  normalized_country_code text := nullif(upper(btrim(p_country_code)), '');
  normalized_city text := nullif(btrim(p_city), '');
  v_studio_id uuid;
  v_system_role text;
begin
  if auth.uid() is null then raise exception 'Authentication is required to update a profile'; end if;
  if normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$' then raise exception 'Profile country must be an ISO 3166-1 alpha-2 uppercase code'; end if;
  if normalized_city is not null and normalized_country_code is null then raise exception 'A profile city requires a country'; end if;
  if p_city_geonames_id is not null and normalized_city is null then raise exception 'A GeoNames city identifier requires a city'; end if;
  if p_city_geonames_id is not null and p_city_geonames_id <= 0 then raise exception 'A GeoNames city identifier must be a positive integer'; end if;

  select sm.studio_id, sm.system_role into v_studio_id, v_system_role
  from public.studio_members sm
  where sm.user_id = auth.uid() and sm.is_active
  order by sm.joined_at nulls last
  limit 1;
  if v_studio_id is null then raise exception 'An active studio membership is required to update a profile'; end if;

  update public.profiles set
    birth_date = p_birth_date,
    country_code = normalized_country_code,
    city = normalized_city,
    city_geonames_id = p_city_geonames_id,
    notification_popups_enabled = coalesce(p_notification_popups_enabled, notification_popups_enabled),
    notification_sound_enabled = coalesce(p_notification_sound_enabled, notification_sound_enabled)
  where id = auth.uid();
  if not found then raise exception 'Authenticated profile was not found'; end if;

  if v_system_role = 'admin' then
    update public.studio_members set joined_at = p_joined_at
    where studio_id = v_studio_id and user_id = auth.uid() and is_active;
  end if;
end;
$$;

revoke all on function public.update_my_profile_details(date, text, text, bigint, date, boolean, boolean) from public, anon;
grant execute on function public.update_my_profile_details(date, text, text, bigint, date, boolean, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
