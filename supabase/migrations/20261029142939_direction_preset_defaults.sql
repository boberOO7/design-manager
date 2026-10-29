-- Studio-owned starting guides supplied by the studio. Existing overrides win.
insert into public.studio_direction_presets(studio_id,kind,coefficient,recommended_min,recommended_max)
select s.id,d.kind,d.coefficient,d.minimum,d.maximum from public.studios s cross join (
  values ('interior',1.00::numeric,0.80::numeric,1.20::numeric),
    ('facade',0.35,0.25,0.60),('landscape',0.15,0.05,0.25),
    ('architecture',0.80,0.50,1.20),('exterior',0.30,0.20,0.50),('custom',1.00,null,null)
) d(kind,coefficient,minimum,maximum)
on conflict(studio_id,kind) do nothing;

create function private.seed_studio_direction_presets() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.studio_direction_presets(studio_id,kind,coefficient,recommended_min,recommended_max)
  values (new.id,'interior',1.00,0.80,1.20),(new.id,'facade',0.35,0.25,0.60),
    (new.id,'landscape',0.15,0.05,0.25),(new.id,'architecture',0.80,0.50,1.20),
    (new.id,'exterior',0.30,0.20,0.50),(new.id,'custom',1.00,null,null);
  return new;
end $$;
revoke all on function private.seed_studio_direction_presets() from public,anon,authenticated;
create trigger seed_studio_direction_presets after insert on public.studios
for each row execute function private.seed_studio_direction_presets();
