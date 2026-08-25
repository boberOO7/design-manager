-- This controls employee access to the leaderboard presentation only. It does
-- not affect productivity attribution, aggregates, historical records, or bonuses.
alter table public.studios
  add column leaderboard_visible_to_employees boolean not null default false;

-- The existing studio member select policy remains the RLS boundary; retain the
-- explicit Data API read grant for the newly exposed studio preference.
grant select on table public.studios to authenticated;

create or replace function public.set_leaderboard_employee_visibility(
  p_studio_id uuid,
  p_visible boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then
    raise exception 'Only active studio administrators can change leaderboard visibility';
  end if;

  update public.studios
  set leaderboard_visible_to_employees = p_visible
  where id = p_studio_id;
end;
$$;

revoke execute on function public.set_leaderboard_employee_visibility(uuid, boolean) from public, anon;
grant execute on function public.set_leaderboard_employee_visibility(uuid, boolean) to authenticated;
