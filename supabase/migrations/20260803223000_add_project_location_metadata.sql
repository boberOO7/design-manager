alter table public.projects
  add column project_type text check (project_type is null or char_length(btrim(project_type)) between 1 and 100),
  add column city text check (city is null or char_length(btrim(city)) between 1 and 100);

grant update (project_type, city) on table public.projects to authenticated;
