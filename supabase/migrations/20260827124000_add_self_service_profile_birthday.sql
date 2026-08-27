create function public.update_my_profile_birthday(p_birth_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to update a profile birthday';
  end if;

  update public.profiles
  set birth_date = p_birth_date
  where id = auth.uid();

  if not found then
    raise exception 'Authenticated profile was not found';
  end if;
end;
$$;

revoke all on function public.update_my_profile_birthday(date) from public, anon;
grant execute on function public.update_my_profile_birthday(date) to authenticated;
