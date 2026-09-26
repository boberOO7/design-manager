alter table public.studios
  add column vacation_visible_to_employees boolean not null default true;

create function public.set_vacation_employee_visibility(p_studio_id uuid, p_visible boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then
    raise exception 'Only active studio administrators can change vacation visibility';
  end if;
  if p_visible is null then raise exception 'Vacation visibility is required'; end if;
  update public.studios set vacation_visible_to_employees = p_visible where id = p_studio_id;
end;
$$;
revoke all on function public.set_vacation_employee_visibility(uuid, boolean) from public, anon;
grant execute on function public.set_vacation_employee_visibility(uuid, boolean) to authenticated;

create function private.enforce_vacation_employee_visibility()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.request_type = 'vacation'
    and auth.uid() is not null
    and not coalesce(private.is_studio_admin(new.studio_id), false)
    and exists (select 1 from public.studios where id = new.studio_id and not vacation_visible_to_employees) then
    raise exception 'Vacation requests are hidden from employees';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_vacation_employee_visibility() from public, anon, authenticated;
create trigger enforce_vacation_employee_visibility_before_insert
before insert on public.time_off_requests
for each row execute function private.enforce_vacation_employee_visibility();
