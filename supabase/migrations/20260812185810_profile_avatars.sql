insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "avatars_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create or replace function public.update_my_avatar(p_avatar_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
begin
  if authenticated_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_avatar_path is not null and (
    array_length(storage.foldername(p_avatar_path), 1) <> 1
    or (storage.foldername(p_avatar_path))[1] <> authenticated_user_id::text
    or not exists (
      select 1
      from storage.objects
      where bucket_id = 'avatars'
        and name = p_avatar_path
    )
  ) then
    raise exception 'Avatar must be an object in the authenticated user folder';
  end if;

  update public.profiles
  set avatar_url = p_avatar_path
  where id = authenticated_user_id;

  if not found then
    raise exception 'Authenticated profile was not found';
  end if;

  return p_avatar_path;
end;
$$;

revoke all on function public.update_my_avatar(text) from public, anon;
grant execute on function public.update_my_avatar(text) to authenticated;
