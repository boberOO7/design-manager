-- The secret-key client is used only by trusted server-side invitation and
-- bootstrap tooling. It bypasses RLS, but still needs explicit table privileges
-- because these tables are created by the postgres migration owner.
grant select, insert, update on table public.studios to service_role;
grant select, insert, update on table public.profiles to service_role;
grant select, insert, update on table public.studio_members to service_role;
