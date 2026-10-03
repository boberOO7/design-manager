-- The verified administrator Dashboard reads task accounting snapshots on the
-- server. Give its privileged client only the columns needed for that query;
-- authenticated callers retain the separate non-accounting task column grants.
grant select (id, project_id, productivity_area_m2)
  on public.tasks to service_role;
