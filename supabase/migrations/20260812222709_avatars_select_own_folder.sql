create policy "avatars_select_own_folder"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
