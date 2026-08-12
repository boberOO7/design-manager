alter table public.profiles
  add column country_code text,
  add column city text,
  add column city_geonames_id bigint,
  add constraint profiles_country_code_iso_alpha_2
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add constraint profiles_city_requires_country
    check (city is null or country_code is not null),
  add constraint profiles_city_geonames_id_requires_city
    check (city_geonames_id is null or city is not null),
  add constraint profiles_city_geonames_id_positive
    check (city_geonames_id is null or city_geonames_id > 0);

create or replace function public.update_my_profile_location(
  p_country_code text,
  p_city text,
  p_city_geonames_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_country_code text := nullif(upper(btrim(p_country_code)), '');
  normalized_city text := nullif(btrim(p_city), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to update a profile location';
  end if;

  if normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Profile country must be an ISO 3166-1 alpha-2 uppercase code';
  end if;

  if normalized_city is not null and normalized_country_code is null then
    raise exception 'A profile city requires a country';
  end if;

  if p_city_geonames_id is not null and normalized_city is null then
    raise exception 'A GeoNames city identifier requires a city';
  end if;

  if p_city_geonames_id is not null and p_city_geonames_id <= 0 then
    raise exception 'A GeoNames city identifier must be a positive integer';
  end if;

  update public.profiles
  set
    country_code = normalized_country_code,
    city = normalized_city,
    city_geonames_id = p_city_geonames_id
  where id = auth.uid();

  if not found then
    raise exception 'Authenticated profile was not found';
  end if;
end;
$$;

revoke all on function public.update_my_profile_location(text, text, bigint) from public, anon;
grant execute on function public.update_my_profile_location(text, text, bigint) to authenticated;
