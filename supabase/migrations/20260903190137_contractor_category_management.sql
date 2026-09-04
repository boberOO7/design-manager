create or replace function public.rename_contractor_category(p_category_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_studio_ids uuid[];
  v_roles text[];
begin
  select array_agg(member.studio_id order by member.joined_at asc), array_agg(member.system_role order by member.joined_at asc)
  into v_studio_ids, v_roles
  from public.studio_members as member
  where member.user_id = auth.uid() and member.is_active;

  if coalesce(cardinality(v_studio_ids), 0) <> 1 or v_roles[1] <> 'admin' then
    raise exception 'contractor_category_permission_denied';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 then
    raise exception 'contractor_category_name_invalid';
  end if;
  if exists (
    select 1
    from public.contractor_categories as category
    where category.studio_id = v_studio_ids[1]
      and category.id <> p_category_id
      and lower(btrim(category.name)) = lower(btrim(p_name))
  ) then
    raise exception 'contractor_category_name_taken';
  end if;

  update public.contractor_categories
  set name = btrim(p_name)
  where id = p_category_id and studio_id = v_studio_ids[1];
  if not found then raise exception 'contractor_category_not_found'; end if;
exception
  when unique_violation then raise exception 'contractor_category_name_taken';
end;
$$;

create or replace function public.delete_contractor_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_studio_ids uuid[];
  v_roles text[];
begin
  select array_agg(member.studio_id order by member.joined_at asc), array_agg(member.system_role order by member.joined_at asc)
  into v_studio_ids, v_roles
  from public.studio_members as member
  where member.user_id = auth.uid() and member.is_active;

  if coalesce(cardinality(v_studio_ids), 0) <> 1 or v_roles[1] <> 'admin' then
    raise exception 'contractor_category_permission_denied';
  end if;
  if not exists (
    select 1 from public.contractor_categories as category
    where category.id = p_category_id and category.studio_id = v_studio_ids[1]
  ) then
    raise exception 'contractor_category_not_found';
  end if;
  if exists (select 1 from public.contractors as contractor where contractor.category_id = p_category_id) then
    raise exception 'contractor_category_in_use';
  end if;

  delete from public.contractor_categories
  where id = p_category_id and studio_id = v_studio_ids[1];
exception
  when foreign_key_violation then raise exception 'contractor_category_in_use';
end;
$$;

revoke all on function public.rename_contractor_category(uuid, text) from public;
revoke all on function public.delete_contractor_category(uuid) from public;
grant execute on function public.rename_contractor_category(uuid, text) to authenticated;
grant execute on function public.delete_contractor_category(uuid) to authenticated;
