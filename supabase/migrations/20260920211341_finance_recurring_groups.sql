-- Page organization only: no categories, terms, occurrences or reporting data change.
create table public.finance_recurring_groups (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  name text not null check(name=btrim(name) and char_length(name) between 1 and 80),
  position integer not null check(position>=0),
  unique(studio_id,id)
);
create unique index finance_recurring_groups_name_idx on public.finance_recurring_groups(studio_id,lower(name));
create index finance_recurring_groups_order_idx on public.finance_recurring_groups(studio_id,position,id);
alter table public.finance_recurring_groups enable row level security;
revoke all on public.finance_recurring_groups from public,anon,authenticated,service_role;
grant select on public.finance_recurring_groups to authenticated;
create policy finance_admin_read on public.finance_recurring_groups for select to authenticated using((select private.is_finance_admin(studio_id)));

alter table public.finance_schedules add column group_id uuid;
alter table public.finance_schedules add constraint finance_schedule_group_recurring check(group_id is null or kind='recurring');
alter table public.finance_schedules add constraint finance_schedule_group_studio_fkey foreign key(studio_id,group_id) references public.finance_recurring_groups(studio_id,id) on delete restrict;
create index finance_schedules_group_idx on public.finance_schedules(studio_id,group_id) where group_id is not null;

create function public.manage_finance_recurring_group(p_studio_id uuid,p_operation text,p_id uuid,p_name text default null,p_schedule_id uuid default null) returns uuid
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

-- Preserve the existing financial transaction, adding only organization metadata.
-- Its request payload includes groupId. Replays must not undo a later group move.
create function public.save_finance_recurring_schedule(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; group_id uuid:=nullif(p_input->>'groupId','')::uuid; replay boolean;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_input->>'kind' is distinct from 'recurring' then raise exception 'finance_group_invalid'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if not found then raise exception 'finance_setup_required'; end if;
  if group_id is not null and not exists(select 1 from public.finance_recurring_groups g where g.studio_id=p_studio_id and g.id=group_id) then raise exception 'finance_group_invalid'; end if;
  replay:=exists(select 1 from public.finance_planning_requests where studio_id=p_studio_id and request_id=p_request_id);
  result:=public.save_finance_schedule(p_studio_id,p_request_id,p_input);
  if not replay then
    perform public.manage_finance_recurring_group(p_studio_id,'assign',group_id,null,result);
  end if;
  return result;
end $$;
revoke all on function public.manage_finance_recurring_group(uuid,text,uuid,text,uuid),public.save_finance_recurring_schedule(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.manage_finance_recurring_group(uuid,text,uuid,text,uuid),public.save_finance_recurring_schedule(uuid,uuid,jsonb) to authenticated;
