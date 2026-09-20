-- An omitted group means Ungrouped; make this explicit in generated RPC arguments.
create or replace function public.manage_finance_recurring_group(p_studio_id uuid,p_operation text,p_id uuid default null,p_name text default null,p_schedule_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare current_group public.finance_recurring_groups; neighbor public.finance_recurring_groups;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if not found then raise exception 'finance_setup_required'; end if;
  if p_operation='assign' then
    if p_id is not null and not exists(select 1 from public.finance_recurring_groups where studio_id=p_studio_id and id=p_id) then raise exception 'finance_group_invalid'; end if;
    update public.finance_schedules set group_id=p_id where studio_id=p_studio_id and id=p_schedule_id and kind='recurring';
    if not found then raise exception 'finance_group_invalid'; end if;
    return p_schedule_id;
  end if;
  if p_operation='create' then
    if p_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'finance_group_invalid'; end if;
    select * into current_group from public.finance_recurring_groups where id=p_id;
    if found then
      if current_group.studio_id<>p_studio_id or current_group.name<>btrim(p_name) then raise exception 'finance_request_conflict'; end if;
      return p_id;
    end if;
    insert into public.finance_recurring_groups(id,studio_id,name,position)
      select p_id,p_studio_id,btrim(p_name),coalesce(max(position)+1,0) from public.finance_recurring_groups where studio_id=p_studio_id;
    return p_id;
  end if;
  select * into current_group from public.finance_recurring_groups where studio_id=p_studio_id and id=p_id;
  if not found then raise exception 'finance_group_invalid'; end if;
  if p_operation='rename' then
    if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'finance_group_invalid'; end if;
    update public.finance_recurring_groups set name=btrim(p_name) where studio_id=p_studio_id and id=p_id;
  elsif p_operation in ('up','down') then
    select * into neighbor from public.finance_recurring_groups where studio_id=p_studio_id
      and case when p_operation='up' then position<current_group.position else position>current_group.position end
      order by case when p_operation='up' then -position else position end,id limit 1;
    if found then
      update public.finance_recurring_groups set position=case when id=p_id then neighbor.position else current_group.position end
        where studio_id=p_studio_id and id in (p_id,neighbor.id);
    end if;
  else raise exception 'finance_group_invalid'; end if;
  return p_id;
end $$;

