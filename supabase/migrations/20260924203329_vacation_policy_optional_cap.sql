create or replace function public.save_studio_vacation_policy(
  p_studio_id uuid, p_annual_days integer, p_carry_rule text, p_carry_cap_days integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare current_policy record;
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then
    raise exception 'Only active studio administrators can save the vacation policy';
  end if;
  if p_annual_days is null or p_annual_days < 0
    or p_carry_rule not in ('carry_all', 'capped', 'none')
    or (p_carry_rule = 'capped' and (p_carry_cap_days is null or p_carry_cap_days < 0))
    or (p_carry_rule <> 'capped' and p_carry_cap_days is not null) then
    raise exception 'Invalid vacation policy';
  end if;
  perform 1 from public.studios where id = p_studio_id for update;
  if not found then raise exception 'Studio was not found'; end if;
  select * into current_policy from private.vacation_policy_at(p_studio_id, clock_timestamp());
  if current_policy.annual_days = p_annual_days and current_policy.carry_rule = p_carry_rule
    and current_policy.carry_cap_days is not distinct from p_carry_cap_days then return; end if;
  insert into private.studio_vacation_policies (studio_id, annual_days, carry_rule, carry_cap_days)
  values (p_studio_id, p_annual_days, p_carry_rule, p_carry_cap_days);
end;
$$;
