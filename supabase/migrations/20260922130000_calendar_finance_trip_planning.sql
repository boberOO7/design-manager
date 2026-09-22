-- Calendar owns linked operational metadata; Finance owns all money and reconciliation.
alter table public.calendar_events add constraint calendar_events_studio_id_id_key unique(studio_id,id);
alter table public.finance_trips
  add column calendar_event_id uuid,
  add column calendar_source_id uuid,
  add column calendar_state text check(calendar_state in ('active','cancelled','deleted','changed_type')),
  add constraint finance_trips_calendar_source_key unique(studio_id,calendar_source_id),
  add constraint finance_trips_calendar_event_fk foreign key(studio_id,calendar_event_id) references public.calendar_events(studio_id,id) on delete set null(calendar_event_id),
  add constraint finance_trips_calendar_source_check check((calendar_source_id is null and calendar_event_id is null and calendar_state is null) or (calendar_source_id is not null and calendar_state is not null and (calendar_event_id is null or calendar_event_id=calendar_source_id)));
create index finance_trips_calendar_event_idx on public.finance_trips(studio_id,calendar_event_id);

create function private.sync_calendar_finance_trip(p_event uuid,p_deleted boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare event public.calendar_events; trip public.finance_trips; trip_destination text; has_history boolean; next_state text;
  previous text:=current_setting('studioflow.trip_calendar_sync',true);
begin
  select * into event from public.calendar_events where id=p_event;
  if event.id is null then return; end if;
  -- Calendar remains available before Finance setup. Finalization backfills existing events.
  perform 1 from public.finance_settings where studio_id=event.studio_id and finalized_at is not null for update;
  if not found then return; end if;
  select * into trip from public.finance_trips where studio_id=event.studio_id and calendar_source_id=p_event;
  next_state:=case when p_deleted then 'deleted' when event.cancelled_at is not null then 'cancelled' when event.event_type<>'business_trip' then 'changed_type' else 'active' end;
  if trip.id is null and next_state<>'active' then return; end if;
  select exists(select 1 from public.finance_trip_entries where studio_id=event.studio_id and trip_id=trip.id) into has_history;
  perform set_config('studioflow.trip_calendar_sync','on',true);
  if next_state<>'active' then
    update public.finance_trips set calendar_state=next_state,calendar_event_id=case when p_deleted then null else p_event end,
      status=case when has_history then status else 'cancelled' end,version=version+1,updated_at=now()
      where id=trip.id and (calendar_state is distinct from next_state or (p_deleted and calendar_event_id is not null));
  else
    select coalesce(nullif(concat_ws(', ',nullif(city,''),nullif(country_code,'')),''),name) into trip_destination from public.projects where studio_id=event.studio_id and id=event.project_id;
    trip_destination:=left(coalesce(nullif(event.location,''),trip_destination,event.title),160);
    if trip.id is null then
      insert into public.finance_trips(studio_id,title,destination,starts_on,ends_on,project_id,note,created_by,calendar_event_id,calendar_source_id,calendar_state)
      values(event.studio_id,left(event.title,160),trip_destination,(event.starts_at at time zone 'Europe/Kyiv')::date,
        greatest((event.starts_at at time zone 'Europe/Kyiv')::date,(event.ends_at at time zone 'Europe/Kyiv')::date-case when event.all_day then 1 else 0 end),
        event.project_id,left(coalesce(event.description,''),2000),event.created_by,p_event,p_event,'active') returning * into trip;
    else
      update public.finance_trips set title=left(event.title,160),destination=trip_destination,
        starts_on=(event.starts_at at time zone 'Europe/Kyiv')::date,
        ends_on=greatest((event.starts_at at time zone 'Europe/Kyiv')::date,(event.ends_at at time zone 'Europe/Kyiv')::date-case when event.all_day then 1 else 0 end),
        project_id=case when has_history then trip.project_id else event.project_id end,note=left(coalesce(event.description,''),2000),
        calendar_state='active',status=case when trip.calendar_state<>'active' and not has_history then 'planned' else trip.status end,
        version=version+1,updated_at=now()
      where id=trip.id and (title,destination,starts_on,ends_on,project_id,note,calendar_state) is distinct from
        (left(event.title,160),trip_destination,(event.starts_at at time zone 'Europe/Kyiv')::date,
        greatest((event.starts_at at time zone 'Europe/Kyiv')::date,(event.ends_at at time zone 'Europe/Kyiv')::date-case when event.all_day then 1 else 0 end),
        case when has_history then trip.project_id else event.project_id end,left(coalesce(event.description,''),2000),'active');
    end if;
    update public.finance_trip_travelers v set active=false where v.studio_id=event.studio_id and v.trip_id=trip.id and v.active
      and not exists(select 1 from public.calendar_event_participants p where p.event_id=p_event and p.user_id=v.employee_id);
    insert into public.finance_trip_travelers(studio_id,trip_id,employee_id,employee_name)
      select event.studio_id,trip.id,p.user_id,u.full_name from public.calendar_event_participants p join public.profiles u on u.id=p.user_id
      join public.studio_members m on m.studio_id=event.studio_id and m.user_id=p.user_id where p.event_id=p_event
      on conflict(studio_id,trip_id,employee_id) do update set active=true where not finance_trip_travelers.active;
  end if;
  perform set_config('studioflow.trip_calendar_sync',coalesce(previous,''),true);
end $$;

create function private.sync_calendar_finance_trip_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin
  if tg_table_name='calendar_events' then
    perform private.sync_calendar_finance_trip(coalesce(new.id,old.id),tg_op='DELETE');
  elsif tg_table_name='calendar_event_participants' then
    perform private.sync_calendar_finance_trip(coalesce(new.event_id,old.event_id));
  elsif tg_table_name='finance_settings' then
    for event_id in select id from public.calendar_events where studio_id=new.studio_id and event_type='business_trip' and cancelled_at is null loop
      perform private.sync_calendar_finance_trip(event_id);
    end loop;
  else
    for event_id in select id from public.calendar_events where studio_id=new.studio_id and project_id=new.id and event_type='business_trip' and cancelled_at is null loop
      perform private.sync_calendar_finance_trip(event_id);
    end loop;
  end if;
  return coalesce(new,old);
end $$;
create trigger calendar_finance_trip_sync after insert or update on public.calendar_events for each row execute function private.sync_calendar_finance_trip_trigger();
create trigger calendar_finance_trip_delete before delete on public.calendar_events for each row execute function private.sync_calendar_finance_trip_trigger();
create trigger calendar_finance_trip_participants after insert or delete on public.calendar_event_participants for each row execute function private.sync_calendar_finance_trip_trigger();
create trigger calendar_finance_trip_setup after update of finalized_at on public.finance_settings for each row when (old.finalized_at is null and new.finalized_at is not null) execute function private.sync_calendar_finance_trip_trigger();
create trigger calendar_finance_trip_destination after update of city,country_code on public.projects for each row when ((old.city,old.country_code) is distinct from (new.city,new.country_code)) execute function private.sync_calendar_finance_trip_trigger();
revoke all on function private.sync_calendar_finance_trip(uuid,boolean),private.sync_calendar_finance_trip_trigger() from public,anon,authenticated,service_role;

-- Per-diem coverage is immutable receipt context; payer remains the actual payer.
alter table public.finance_trip_entries add column traveler_count integer not null default 1 check(traveler_count between 1 and 100);
alter table public.finance_trip_entries drop constraint finance_trip_entries_check6;
alter table public.finance_trip_entries add constraint finance_trip_per_diem_check check(
  (daily_rate is null and day_count is null and traveler_count=1) or
  (daily_rate is not null and day_count is not null and daily_rate>0 and day_count between 1 and 366 and abs(amount)=daily_rate*day_count*traveler_count and expense_type='meals'));
create table public.finance_trip_entry_travelers (
  studio_id uuid not null,trip_id uuid not null,entry_id uuid not null,employee_id uuid not null,
  primary key(studio_id,entry_id,employee_id),
  foreign key(studio_id,entry_id,trip_id) references public.finance_trip_entries(studio_id,id,trip_id) on delete restrict,
  foreign key(studio_id,trip_id,employee_id) references public.finance_trip_travelers(studio_id,trip_id,employee_id) on delete restrict
);
create index finance_trip_entry_travelers_trip_idx on public.finance_trip_entry_travelers(studio_id,trip_id,employee_id);
alter table public.finance_trip_entry_travelers enable row level security;
revoke all on public.finance_trip_entry_travelers from public,anon,authenticated,service_role;
grant select on public.finance_trip_entry_travelers to authenticated;
create policy trip_admin on public.finance_trip_entry_travelers for select to authenticated using((select private.is_finance_admin(studio_id)));
create trigger finance_trip_entry_travelers_immutable before update or delete on public.finance_trip_entry_travelers for each row execute function private.reject_finance_history_change();

-- Foreign plans carry no historical transaction rate. Current estimates are read-time assumptions.
alter table public.finance_trip_entries alter column reporting_amount drop not null,alter column fx_rate drop not null,alter column fx_source drop not null,alter column fx_effective_date drop not null;
alter table public.finance_trip_entries add constraint finance_trip_actual_valuation_required check(kind='plan' or (reporting_amount is not null and fx_rate is not null and fx_source is not null and fx_effective_date is not null));

create or replace function public.record_finance_trip_entry(p_studio_id uuid,p_request_id uuid,p_trip_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','trip_entry','trip',p_trip_id,'input',p_input); result uuid;
  setup public.finance_settings; trip public.finance_trips; original public.finance_trip_entries; plan public.finance_trip_entries;
  payment public.finance_payment_availability; entry public.finance_movement_entries; valuation record;
  kind text:=p_input->>'kind'; day date:=(p_input->>'date')::date; amount numeric:=(p_input->>'amount')::numeric;
  currency text:=p_input->>'currency'; employee uuid:=nullif(p_input->>'employeeId','')::uuid; movement uuid; expected uuid; category uuid; digits integer; a record; covered uuid[]:='{}'; coverage integer:=1;
  previous text:=current_setting('studioflow.trip_reconcile',true);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id and finalized_at is not null;
  select * into trip from public.finance_trips where studio_id=p_studio_id and id=p_trip_id;
  if setup.studio_id is null or trip.id is null then raise exception 'finance_trip_invalid'; end if;
  result:=gen_random_uuid();
  if nullif(p_input->>'reversesId','') is not null then
    select * into original from public.finance_trip_entries where studio_id=p_studio_id and trip_id=p_trip_id and id=(p_input->>'reversesId')::uuid and reverses_id is null;
    if original.id is null or original.movement_id is not null or char_length(btrim(coalesce(p_input->>'note',''))) not between 1 and 2000
      or exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and plan_id=original.id) then raise exception 'finance_trip_correction_invalid'; end if;
    if original.expected_item_id is not null then
      if exists(select 1 from public.finance_allocations where studio_id=p_studio_id and expected_item_id=original.expected_item_id) then raise exception 'finance_trip_plan_settled'; end if;
      perform set_config('studioflow.trip_reconcile','on',true);
      update public.finance_expected_items set commitment='cancelled',is_established=false,version=version+1 where studio_id=p_studio_id and id=original.expected_item_id;
    end if;
    insert into public.finance_trip_entries(id,studio_id,trip_id,kind,expense_type,label,amount,currency,financial_date,employee_id,reverses_id,note,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,daily_rate,day_count,traveler_count,created_by)
    values(result,p_studio_id,p_trip_id,original.kind,original.expense_type,original.label,-original.amount,original.currency,original.financial_date,original.employee_id,original.id,btrim(p_input->>'note'),original.reporting_currency,-original.reporting_amount,original.fx_rate,original.fx_source,original.fx_effective_date,original.daily_rate,original.day_count,original.traveler_count,auth.uid());
  else
    if nullif(p_input->>'dailyRate','') is not null and p_input ? 'coveredTravelerIds' then
      if jsonb_typeof(p_input->'coveredTravelerIds') is distinct from 'array' then raise exception 'finance_trip_traveler_invalid'; end if;
      select array_agg(distinct value::uuid) into covered from jsonb_array_elements_text(p_input->'coveredTravelerIds');
      coverage:=coalesce(cardinality(covered),0);
      if coverage not between 1 and 100 or exists(select 1 from unnest(covered) u where not exists(select 1 from public.finance_trip_travelers v where v.studio_id=p_studio_id and v.trip_id=p_trip_id and v.employee_id=u and v.active)) then raise exception 'finance_trip_traveler_invalid'; end if;
    end if;
    if trip.status='cancelled' then raise exception 'finance_trip_closed'; end if;
    select minor_units into digits from public.finance_currencies where code=currency;
    if kind is null or kind not in ('plan','expense','advance') or day is null or (kind<>'plan' and (day<setup.cutover_date or day>(now() at time zone 'Europe/Kyiv')::date))
      or digits is null or amount is null or not(amount>0 and amount<=9999999999.9999) or amount<>round(amount,digits) then raise exception 'finance_amount_invalid'; end if;
    if employee is not null and not exists(select 1 from public.finance_trip_travelers where studio_id=p_studio_id and trip_id=p_trip_id and employee_id=employee and active) then raise exception 'finance_trip_traveler_invalid'; end if;
    if kind='advance' and employee is null then raise exception 'finance_trip_traveler_invalid'; end if;
    if kind='plan' and (employee is not null or nullif(p_input->>'movementId','') is not null or nullif(p_input->>'accountId','') is not null) then raise exception 'finance_input_invalid'; end if;
    if kind='expense' and employee is not null and (nullif(p_input->>'movementId','') is not null or nullif(p_input->>'accountId','') is not null) then raise exception 'finance_input_invalid'; end if;
    if nullif(p_input->>'planId','') is not null then
      select * into plan from public.finance_trip_entries where studio_id=p_studio_id and trip_id=p_trip_id and id=(p_input->>'planId')::uuid and finance_trip_entries.kind='plan' and reverses_id is null;
      if kind<>'expense' or plan.id is null or exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and reverses_id=plan.id) then raise exception 'finance_trip_invalid'; end if;
      perform set_config('studioflow.trip_reconcile','on',true);
      -- A previously paid plan can be converted only with that exact, whole payment.
      for a in select x.*,x.amount+coalesce((select sum(r.amount) from public.finance_allocations r where r.released_allocation_id=x.id),0) as remaining from public.finance_allocations x
        where x.studio_id=p_studio_id and x.expected_item_id=plan.expected_item_id and x.amount>0 loop
        if a.remaining>0 then
          if a.movement_id is distinct from nullif(p_input->>'movementId','')::uuid then raise exception 'finance_trip_plan_settled'; end if;
          perform public.release_finance_allocation(p_studio_id,gen_random_uuid(),a.id,'Trip actual replaces planned cash');
        end if;
      end loop;
      update public.finance_expected_items set commitment='cancelled',is_established=false,version=version+1 where studio_id=p_studio_id and id=plan.expected_item_id;
    end if;
    category:=private.trip_category(p_studio_id,'outgoing');
    if kind='advance' or (kind='expense' and employee is null) then
      movement:=nullif(p_input->>'movementId','')::uuid;
      if movement is null then
        movement:=public.record_finance_movement(p_studio_id,p_request_id,jsonb_build_object('kind','outgoing','date',day,'accountId',p_input->>'accountId','amount',amount,'categoryId',category,'description',trip.title||' · '||coalesce(p_input->>'label',''),'allocationIntent',kind='advance','fx',p_input->'fx'));
      end if;
      select * into payment from public.finance_payment_availability where studio_id=p_studio_id and id=movement;
      select * into entry from public.finance_movement_entries where studio_id=p_studio_id and movement_id=movement and entry_role='primary';
      if payment.id is null or payment.direction<>'outgoing' or payment.nature<>'operating' or payment.currency<>currency
        or payment.original_amount<>amount or payment.unapplied_amount<>amount or payment.financial_date<>day
        or exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and movement_id=movement) then raise exception 'finance_trip_payment_invalid'; end if;
      expected:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_build_object('direction','outgoing','amount',amount,'currency',currency,'categoryId',category,'description',trip.title,'dueDate',day,'expectedDate',day,'commitment','agreed','certainty','fixed','established',true));
      perform public.allocate_finance_payment(p_studio_id,gen_random_uuid(),expected,movement,amount);
      select entry.fx_rate as rate,entry.fx_source as source,entry.fx_effective_date as effective_date,-entry.reporting_amount as reporting_amount into valuation;
    else
      if kind='plan' and currency<>setup.base_currency then
        select null::numeric as rate,null::text as source,null::date as effective_date,null::numeric as reporting_amount into valuation;
      else
        select * into valuation from private.finance_valuation(currency,setup.base_currency,day,amount,p_input->'fx');
      end if;
      if kind='plan' and nullif(p_input->>'expectedDate','') is not null then
        expected:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_build_object('direction','outgoing','amount',amount,'currency',currency,'categoryId',category,'description',trip.title||' · '||coalesce(p_input->>'label',''),'expectedDate',p_input->>'expectedDate','commitment','tentative','certainty','estimated','established',false));
      end if;
    end if;
    insert into public.finance_trip_entries(id,studio_id,trip_id,kind,expense_type,label,amount,currency,financial_date,employee_id,movement_id,expected_item_id,plan_id,note,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,daily_rate,day_count,traveler_count,created_by)
    values(result,p_studio_id,p_trip_id,kind,p_input->>'expenseType',coalesce(p_input->>'label',''),amount,currency,day,employee,movement,expected,plan.id,coalesce(p_input->>'note',''),setup.base_currency,valuation.reporting_amount,valuation.rate,valuation.source,valuation.effective_date,nullif(p_input->>'dailyRate','')::numeric,nullif(p_input->>'dayCount','')::integer,coverage,auth.uid());
  end if;
  if original.id is not null then
    insert into public.finance_trip_entry_travelers select studio_id,trip_id,result,employee_id from public.finance_trip_entry_travelers where studio_id=p_studio_id and entry_id=original.id;
  elsif cardinality(covered)>0 then
    insert into public.finance_trip_entry_travelers select p_studio_id,p_trip_id,result,u from unnest(covered) u;
  end if;
  perform private.reconcile_finance_trip(p_studio_id,p_trip_id);
  perform set_config('studioflow.trip_reconcile',coalesce(previous,''),true);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;


create or replace function public.save_finance_trip(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','trip','input',p_input); result uuid; old public.finance_trips; person uuid;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_finalized_setup_required'; end if;
  result:=coalesce(nullif(p_input->>'id','')::uuid,gen_random_uuid());
  select * into old from public.finance_trips where studio_id=p_studio_id and id=result;
  if nullif(p_input->>'id','') is not null and old.id is null then raise exception 'finance_trip_invalid'; end if;
  if old.id is not null and old.version is distinct from (p_input->>'version')::integer then raise exception 'finance_version_conflict'; end if;
  if old.calendar_source_id is not null then
    if (old.title,old.destination,old.starts_on,old.ends_on,old.project_id,old.note) is distinct from
      (btrim(p_input->>'title'),btrim(p_input->>'destination'),(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,nullif(p_input->>'projectId','')::uuid,coalesce(p_input->>'note',''))
      or (select coalesce(array_agg(employee_id order by employee_id),'{}'::uuid[]) from public.finance_trip_travelers where studio_id=p_studio_id and trip_id=old.id and active)
        is distinct from (select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) from jsonb_array_elements_text(p_input->'travelers')) then raise exception 'finance_trip_calendar_owned'; end if;
  end if;
  if jsonb_typeof(p_input->'travelers') is distinct from 'array' then raise exception 'finance_input_invalid'; end if;
  if old.id is not null and old.project_id is distinct from nullif(p_input->>'projectId','')::uuid
    and exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and trip_id=result) then raise exception 'finance_trip_project_locked'; end if;
  insert into public.finance_trips(id,studio_id,title,destination,starts_on,ends_on,project_id,note,status,created_by)
  values(result,p_studio_id,btrim(p_input->>'title'),btrim(p_input->>'destination'),(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,
    nullif(p_input->>'projectId','')::uuid,coalesce(p_input->>'note',''),p_input->>'status',auth.uid())
  on conflict(id) do update set title=excluded.title,destination=excluded.destination,starts_on=excluded.starts_on,ends_on=excluded.ends_on,
    project_id=excluded.project_id,note=excluded.note,status=excluded.status,version=finance_trips.version+1,updated_at=now();
  update public.finance_trip_travelers set active=false where studio_id=p_studio_id and trip_id=result;
  for person in select distinct value::uuid from jsonb_array_elements_text(p_input->'travelers') loop
    if not exists(select 1 from public.studio_members m join public.profiles p on p.id=m.user_id where m.studio_id=p_studio_id and m.user_id=person and m.is_active and p.is_active)
      and not exists(select 1 from public.finance_trip_travelers where studio_id=p_studio_id and trip_id=result and employee_id=person) then raise exception 'finance_trip_traveler_invalid'; end if;
    insert into public.finance_trip_travelers(studio_id,trip_id,employee_id,employee_name)
      select p_studio_id,result,person,full_name from public.profiles where id=person
      on conflict(studio_id,trip_id,employee_id) do update set active=true;
  end loop;
  perform private.reconcile_finance_trip(p_studio_id,result);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;


drop view public.finance_trip_totals;
drop view public.finance_trip_entry_values;
create view public.finance_trip_entry_values with(security_invoker=true) as
select e.*,coalesce(c.amount,e.amount) as net_amount,coalesce(c.reporting_amount,e.reporting_amount) as net_reporting_amount
from public.finance_trip_entries e left join lateral (
  select -sum(v.amount) as amount,-sum(v.reporting_amount) as reporting_amount
  from public.finance_movements m join public.finance_movement_entries v on v.studio_id=m.studio_id and v.movement_id=m.id and v.entry_role='primary'
  where m.studio_id=e.studio_id and (m.id=e.movement_id or m.related_movement_id=e.movement_id
    or m.related_movement_id in(select id from public.finance_movements where studio_id=e.studio_id and related_movement_id=e.movement_id))
) c on e.movement_id is not null;

create view public.finance_trip_totals with(security_invoker=true) as
select t.*,s.base_currency as reporting_currency,case when v.foreign_plan then null else coalesce(v.plan,0)::text end as planned_amount,coalesce(v.actual,0)::text as actual_amount,
  case when v.foreign_plan then null else (coalesce(v.actual,0)-coalesce(v.plan,0))::text end as variance,coalesce(v.studio_paid,0)::text as studio_paid,coalesce(v.employee_paid,0)::text as employee_paid
from public.finance_trips t join public.finance_settings s on s.studio_id=t.studio_id left join lateral (
  select sum(net_amount) filter(where kind='plan' and currency=s.base_currency) as plan,bool_or(kind='plan' and currency<>s.base_currency) as foreign_plan,sum(net_reporting_amount) filter(where kind='expense') as actual,
    sum(net_reporting_amount) filter(where kind='expense' and employee_id is null) as studio_paid,
    sum(net_reporting_amount) filter(where kind='expense' and employee_id is not null) as employee_paid
  from public.finance_trip_entry_values where studio_id=t.studio_id and trip_id=t.id
) v on true;


revoke all on public.finance_trip_entry_values,public.finance_trip_totals from public,anon,authenticated,service_role;
grant select on public.finance_trip_entry_values,public.finance_trip_totals to authenticated;

-- Existing eligible events are linked once. No Finance configuration is invented.
do $$ declare event_id uuid; begin
  for event_id in select e.id from public.calendar_events e join public.finance_settings s on s.studio_id=e.studio_id and s.finalized_at is not null where e.event_type='business_trip' and e.cancelled_at is null loop
    perform private.sync_calendar_finance_trip(event_id);
  end loop;
end $$;
