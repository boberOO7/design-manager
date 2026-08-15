insert into public.profiles (
  id,
  full_name,
  email,
  system_role
)
values (
  'a8c7d426-3bd0-4940-b629-1f47f3199467',
  'Vasilios',
  'vasilios.bober@gmail.com',
  'admin'
);

insert into public.studio_members (
  studio_id,
  user_id,
  system_role
)
values (
  '00000000-0000-0000-0000-000000000001',
  'a8c7d426-3bd0-4940-b629-1f47f3199467',
  'admin'
);