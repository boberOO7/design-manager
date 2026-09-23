-- The leaderboard needs studio-wide inclusion flags even when a viewer cannot open a project.
-- Project and task names remain subject to the viewer's normal RLS access.
grant select (id, studio_id, include_in_productivity)
on table public.projects to service_role;
