-- Nullable profile fields are deliberately clearable. Defaults make that
-- contract visible to generated RPC types without weakening function guards.
create or replace function public.update_studio_member_profile(
  p_user_id uuid,
  p_full_name text,
  p_job_title text,
  p_system_role text,
  p_joined_at date default null,
  p_birth_date date default null,
  p_country_code text default null,
  p_city text default null,
  p_city_geonames_id bigint default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  normalized_country_code text := nullif(upper(btrim(p_country_code)), ''); normalized_city text := nullif(btrim(p_city), '');
  v_actor_id uuid := (select auth.uid()); v_studio_id uuid; v_target_role text;
begin
  if p_full_name is null or btrim(p_full_name) = '' or length(btrim(p_full_name)) > 121 then raise exception 'A valid full name is required'; end if;
  if p_job_title not in ('Designer', 'Architect') then raise exception 'A supported profession is required'; end if;
  if p_system_role not in ('admin', 'employee') then raise exception 'A supported access role is required'; end if;
  if normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$' then raise exception 'Profile country must be an ISO 3166-1 alpha-2 uppercase code'; end if;
  if normalized_city is not null and normalized_country_code is null then raise exception 'A profile city requires a country'; end if;
  if p_city_geonames_id is not null and normalized_city is null then raise exception 'A GeoNames city identifier requires a city'; end if;
  if p_city_geonames_id is not null and p_city_geonames_id <= 0 then raise exception 'A GeoNames city identifier must be a positive integer'; end if;
  select sm.studio_id into v_studio_id from public.studio_members sm where sm.user_id = v_actor_id and sm.is_active and sm.system_role = 'admin';
  if v_studio_id is null then raise exception 'Only active studio administrators can edit team members'; end if;
  if p_user_id = v_actor_id then raise exception 'Administrators cannot edit their own access through this form'; end if;
  select sm.system_role into v_target_role from public.studio_members sm where sm.studio_id = v_studio_id and sm.user_id = p_user_id and sm.is_active for update;
  if v_target_role is null then raise exception 'Active studio member was not found'; end if;
  perform 1 from public.studio_members sm where sm.studio_id = v_studio_id and sm.is_active and sm.system_role = 'admin' for update;
  if v_target_role = 'admin' and p_system_role = 'employee' and (select count(*) from public.studio_members sm where sm.studio_id = v_studio_id and sm.is_active and sm.system_role = 'admin') <= 1 then raise exception 'The last active administrator cannot be demoted'; end if;
  update public.profiles set full_name = btrim(p_full_name), job_title = p_job_title, system_role = p_system_role, birth_date = p_birth_date, country_code = normalized_country_code, city = normalized_city, city_geonames_id = p_city_geonames_id where id = p_user_id and is_active;
  if not found then raise exception 'Active profile was not found'; end if;
  update public.studio_members set system_role = p_system_role, joined_at = p_joined_at where studio_id = v_studio_id and user_id = p_user_id and is_active;
end;
$$;

create or replace function public.update_my_profile_details(
  p_birth_date date default null, p_country_code text default null, p_city text default null,
  p_city_geonames_id bigint default null, p_joined_at date default null
) returns void language plpgsql security definer set search_path = '' as $$
declare normalized_country_code text := nullif(upper(btrim(p_country_code)), ''); normalized_city text := nullif(btrim(p_city), ''); v_studio_id uuid; v_system_role text;
begin
  if auth.uid() is null then raise exception 'Authentication is required to update a profile'; end if;
  if normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$' then raise exception 'Profile country must be an ISO 3166-1 alpha-2 uppercase code'; end if;
  if normalized_city is not null and normalized_country_code is null then raise exception 'A profile city requires a country'; end if;
  if p_city_geonames_id is not null and normalized_city is null then raise exception 'A GeoNames city identifier requires a city'; end if;
  if p_city_geonames_id is not null and p_city_geonames_id <= 0 then raise exception 'A GeoNames city identifier must be a positive integer'; end if;
  select sm.studio_id, sm.system_role into v_studio_id, v_system_role from public.studio_members sm where sm.user_id = auth.uid() and sm.is_active order by sm.joined_at nulls last limit 1;
  if v_studio_id is null then raise exception 'An active studio membership is required to update a profile'; end if;
  update public.profiles set birth_date = p_birth_date, country_code = normalized_country_code, city = normalized_city, city_geonames_id = p_city_geonames_id where id = auth.uid();
  if not found then raise exception 'Authenticated profile was not found'; end if;
  if v_system_role = 'admin' then update public.studio_members set joined_at = p_joined_at where studio_id = v_studio_id and user_id = auth.uid() and is_active; end if;
end;
$$;

create or replace function public.update_my_avatar(p_avatar_path text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare authenticated_user_id uuid := (select auth.uid());
begin
  if authenticated_user_id is null then raise exception 'Authentication is required'; end if;
  if p_avatar_path is not null and (array_length(storage.foldername(p_avatar_path), 1) <> 1 or (storage.foldername(p_avatar_path))[1] <> authenticated_user_id::text or not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_avatar_path)) then raise exception 'Avatar must be an object in the authenticated user folder'; end if;
  update public.profiles set avatar_url = p_avatar_path where id = authenticated_user_id;
  if not found then raise exception 'Authenticated profile was not found'; end if;
  return p_avatar_path;
end;
$$;
