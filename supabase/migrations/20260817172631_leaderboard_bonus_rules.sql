alter table public.studios
add column leaderboard_bonuses_enabled boolean not null default true;

create table public.leaderboard_bonus_rules (
  studio_id uuid not null references public.studios(id) on delete cascade,
  place integer not null check (place between 1 and 20),
  bonus_percent numeric not null check (bonus_percent >= 0 and bonus_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (studio_id, place)
);

create trigger set_leaderboard_bonus_rules_updated_at
before update on public.leaderboard_bonus_rules
for each row execute function public.set_updated_at();

create or replace function private.create_default_leaderboard_bonus_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.leaderboard_bonuses_enabled then
    insert into public.leaderboard_bonus_rules (studio_id, place, bonus_percent)
    values (new.id, 1, 15), (new.id, 2, 10), (new.id, 3, 5)
    on conflict (studio_id, place) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function private.create_default_leaderboard_bonus_rules() from public, anon, authenticated;

create trigger create_default_leaderboard_bonus_rules_after_studio_insert
after insert on public.studios
for each row execute function private.create_default_leaderboard_bonus_rules();

insert into public.leaderboard_bonus_rules (studio_id, place, bonus_percent)
select studio.id, rule.place, rule.bonus_percent
from public.studios as studio
cross join (values (1, 15::numeric), (2, 10::numeric), (3, 5::numeric)) as rule(place, bonus_percent)
on conflict (studio_id, place) do nothing;

alter table public.leaderboard_bonus_rules enable row level security;

revoke all on table public.leaderboard_bonus_rules from anon, authenticated, service_role;
grant select on public.leaderboard_bonus_rules to authenticated;

create policy "leaderboard_bonus_rules_select_for_active_studio_members"
on public.leaderboard_bonus_rules for select to authenticated
using ((select private.is_studio_member(studio_id)));

create or replace function public.save_leaderboard_bonus_rules(
  p_studio_id uuid,
  p_enabled boolean,
  p_rules jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_count integer;
  valid_rule_count integer;
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then
    raise exception 'Only active studio administrators can save leaderboard bonus rules';
  end if;

  if jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Leaderboard bonus rules must be an array';
  end if;

  rule_count := jsonb_array_length(p_rules);
  if rule_count not between 1 and 20 then
    raise exception 'Leaderboard bonus rules must include between 1 and 20 places';
  end if;

  select count(*) into valid_rule_count
  from (
    select (value ->> 'place')::integer as place, (value ->> 'bonusPercent')::numeric as bonus_percent
    from jsonb_array_elements(p_rules)
  ) as rule
  where rule.place between 1 and 20
    and rule.bonus_percent between 0 and 100;

  if valid_rule_count <> rule_count
    or exists (
      select 1
      from (
        select (value ->> 'place')::integer as place
        from jsonb_array_elements(p_rules)
      ) as rule
      group by rule.place
      having count(*) > 1
    )
    or exists (
      select 1
      from generate_series(1, rule_count) as expected(place)
      where not exists (
        select 1
        from jsonb_array_elements(p_rules) as item(value)
        where (item.value ->> 'place')::integer = expected.place
      )
    ) then
    raise exception 'Leaderboard bonus rules must define each place in order with a percentage from 0 to 100';
  end if;

  update public.studios
  set leaderboard_bonuses_enabled = p_enabled
  where id = p_studio_id;

  insert into public.leaderboard_bonus_rules (studio_id, place, bonus_percent)
  select p_studio_id, rule.place, rule.bonus_percent
  from (
    select (value ->> 'place')::integer as place, (value ->> 'bonusPercent')::numeric as bonus_percent
    from jsonb_array_elements(p_rules)
  ) as rule
  on conflict (studio_id, place) do update
  set bonus_percent = excluded.bonus_percent;

  delete from public.leaderboard_bonus_rules
  where studio_id = p_studio_id
    and place > rule_count;
end;
$$;

revoke execute on function public.save_leaderboard_bonus_rules(uuid, boolean, jsonb) from public, anon;
grant execute on function public.save_leaderboard_bonus_rules(uuid, boolean, jsonb) to authenticated;
