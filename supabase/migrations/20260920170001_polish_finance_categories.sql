-- Category management exposes the same delete/archive decision used by the mutation.
create function public.get_finance_category_management(p_studio_id uuid)
returns table(
  id uuid,
  studio_id uuid,
  name text,
  direction text,
  nature text,
  default_key text,
  custom_name boolean,
  archived_at timestamptz,
  created_at timestamptz,
  can_delete boolean
)
language sql stable security invoker set search_path='' as $$
  select c.id,c.studio_id,c.name,c.direction,c.nature,c.default_key,c.custom_name,c.archived_at,c.created_at,
    c.default_key is null
      and not exists(select 1 from public.finance_movements m where m.studio_id=c.studio_id and m.category_id=c.id)
      and not exists(select 1 from public.finance_expected_items i where i.studio_id=c.studio_id and i.category_id=c.id)
      and not exists(select 1 from public.finance_schedule_terms t where t.studio_id=c.studio_id and t.category_id=c.id)
      and not exists(select 1 from public.finance_budget_revisions b where b.studio_id=c.studio_id and b.category_id=c.id)
  from public.finance_categories c
  where c.studio_id=p_studio_id
  order by c.created_at,c.name,c.id
$$;

create function public.remove_finance_category(p_studio_id uuid,p_category_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare category public.finance_categories; removable boolean;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if not found then raise exception 'finance_category_invalid'; end if;
  select * into category from public.finance_categories
    where studio_id=p_studio_id and id=p_category_id for update;
  if not found then raise exception 'finance_category_invalid'; end if;

  removable:=category.default_key is null
    and not exists(select 1 from public.finance_movements where studio_id=p_studio_id and category_id=p_category_id)
    and not exists(select 1 from public.finance_expected_items where studio_id=p_studio_id and category_id=p_category_id)
    and not exists(select 1 from public.finance_schedule_terms where studio_id=p_studio_id and category_id=p_category_id)
    and not exists(select 1 from public.finance_budget_revisions where studio_id=p_studio_id and category_id=p_category_id);
  if removable then
    delete from public.finance_categories where studio_id=p_studio_id and id=p_category_id;
    return 'deleted';
  end if;

  update public.finance_categories set archived_at=coalesce(archived_at,now())
    where studio_id=p_studio_id and id=p_category_id;
  return 'archived';
end
$$;

revoke all on function public.get_finance_category_management(uuid),public.remove_finance_category(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_finance_category_management(uuid),public.remove_finance_category(uuid,uuid)
  to authenticated;
