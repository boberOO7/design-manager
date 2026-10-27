-- Correct mistaken unposted evidence without rewriting events or accounting history.
alter table public.finance_project_earning_events drop constraint finance_project_earning_events_kind_check;
alter table public.finance_project_earning_events add column reason text;
alter table public.finance_project_earning_events add check(kind in ('delivery','acceptance','void'));
alter table public.finance_project_earning_events add check(kind<>'void' or reason is not null and char_length(btrim(reason)) between 1 and 2000);
create or replace function private.guard_finance_earning_milestone() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'finance_earning_history_protected';end if;
  if exists(select 1 from public.finance_project_earning_events where studio_id=old.studio_id and milestone_id=old.id) then
    if (to_jsonb(new)-'active'-'revision') is distinct from (to_jsonb(old)-'active'-'revision') or new.active
      or not exists(select 1 from public.finance_project_earning_events where studio_id=old.studio_id and milestone_id=old.id and kind='void')
      or exists(select 1 from public.finance_project_earning_events e join public.finance_recognition_entries r on r.studio_id=e.studio_id and r.earning_event_id=e.id where e.studio_id=old.studio_id and e.milestone_id=old.id)
      then raise exception 'finance_earning_history_protected';end if;
  end if;
  if row(new.id,new.studio_id,new.project_id,new.order_id,new.created_by,new.created_at)
    is distinct from row(old.id,old.studio_id,old.project_id,old.order_id,old.created_by,old.created_at) then raise exception 'finance_earning_history_protected';end if;
  return new;
end $$;
create function public.void_unrecognized_earning_milestone(p_studio_id uuid,p_request_id uuid,p_milestone_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','void_unrecognized_earning','milestone',p_milestone_id,'reason',p_reason); result uuid;
  milestone public.finance_project_earning_milestones;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select * into milestone from public.finance_project_earning_milestones where studio_id=p_studio_id and id=p_milestone_id and active;
  if milestone.id is null or char_length(btrim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'finance_input_invalid';end if;
  if not exists(select 1 from public.finance_project_earning_events where studio_id=p_studio_id and milestone_id=milestone.id)
    or exists(select 1 from public.finance_project_earning_events e join public.finance_recognition_entries r on r.studio_id=e.studio_id and r.earning_event_id=e.id where e.studio_id=p_studio_id and e.milestone_id=milestone.id) then raise exception 'finance_earning_history_protected';end if;
  insert into public.finance_project_earning_events(studio_id,milestone_id,kind,occurred_on,confirmed_by,reason)
    values(p_studio_id,milestone.id,'void',(now() at time zone 'Europe/Kyiv')::date,auth.uid(),btrim(p_reason));
  update public.finance_project_earning_milestones set active=false,revision=revision+1 where id=milestone.id;
  result:=milestone.id;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;
revoke all on function public.void_unrecognized_earning_milestone(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.void_unrecognized_earning_milestone(uuid,uuid,uuid,text) to authenticated;
