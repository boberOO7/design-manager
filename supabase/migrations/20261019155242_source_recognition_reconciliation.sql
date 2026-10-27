-- Preserve valid reviews while narrowing the dependency digest. No accounting writes.
create table private.finance_labor_review_digest_aliases (
  studio_id uuid primary key references public.finance_settings(studio_id), legacy_digest text not null, payroll_digest text
);
revoke all on private.finance_labor_review_digest_aliases from public,anon,authenticated,service_role;
insert into private.finance_labor_review_digest_aliases(studio_id,legacy_digest)
  select s.studio_id,r->>'digest' from public.finance_settings s
    cross join lateral private.finance_labor_source_review(s.studio_id) r
    where (r->>'reviewed')::boolean;

create or replace function private.finance_labor_source_review(p_studio uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare recurring jsonb; digest text; review jsonb; cash_ids jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('termId',t.id,'scheduleId',t.schedule_id,'name',t.name,
    'category',c.name,'categoryId',c.id,'categoryKey',c.default_key,'intervalMonths',t.interval_months,'amount',t.amount::text,'currency',t.currency,'effectiveFrom',t.effective_from,
    'effectiveThrough',t.valid_through,'stoppedFrom',s.stopped_from) order by t.id),'[]') into recurring
    from public.finance_schedule_history t join public.finance_schedules s on s.studio_id=t.studio_id and s.id=t.schedule_id
    join public.finance_categories c on c.studio_id=t.studio_id and c.id=t.category_id
    where t.studio_id=p_studio and s.kind='recurring' and (c.default_key in ('salary','employee_bonus','employer_costs')
      or exists(select 1 from public.finance_schedule_terms prior
        join public.finance_categories pc on pc.studio_id=prior.studio_id and pc.id=prior.category_id
        where prior.studio_id=t.studio_id and prior.schedule_id=t.schedule_id
          and pc.default_key in ('salary','employee_bonus','employer_costs'))
      or exists(select 1 from public.finance_schedule_terms prior
        join public.finance_planning_requests r on r.studio_id=prior.studio_id
          and r.payload->>'operation'='labor_capacity' and r.payload->'input'->>'payrollSourcesConfirmed'='true'
          and r.payload->'input'->'payrollCashTermIds' ? prior.id::text
        where prior.studio_id=t.studio_id and prior.schedule_id=t.schedule_id))
      and coalesce(least(t.valid_through,s.stopped_from-1),'infinity'::date)>=coalesce((select recognition_start_month from public.finance_settings where studio_id=p_studio),date_trunc('month',now() at time zone 'Europe/Kyiv')::date);
  digest:=md5(coalesce((select jsonb_agg(x-'name'-'category' order by x->>'termId') from jsonb_array_elements(recurring) x),'[]')::text);
  select r.payload->'input' into review from public.finance_planning_requests r
    where r.studio_id=p_studio and r.payload->>'operation'='labor_capacity'
      and (r.payload->'input'->>'payrollSourceDigest'=digest
        or exists(select 1 from private.finance_labor_review_digest_aliases a where a.studio_id=p_studio
          and a.legacy_digest=r.payload->'input'->>'payrollSourceDigest' and a.payroll_digest=digest))
      and r.payload->'input'->>'payrollSourcesConfirmed'='true'
    order by r.created_at desc,r.request_id desc limit 1;
  select coalesce(jsonb_agg(distinct term order by term),'[]') into cash_ids from public.finance_planning_requests r
    cross join lateral jsonb_array_elements(coalesce(r.payload->'input'->'payrollCashTermIds','[]')) term
    where r.studio_id=p_studio and r.payload->>'operation'='labor_capacity'
      and r.payload->'input'->>'payrollSourcesConfirmed'='true';
  return jsonb_build_object('digest',digest,'reviewed',jsonb_array_length(recurring)=0 or review is not null,
    'recurring',recurring,'cashTermIds',cash_ids);
end $$;

update private.finance_labor_review_digest_aliases a
  set payroll_digest=private.finance_labor_source_review(a.studio_id)->>'digest';

create or replace function private.recognize_finance_earning_event(p_studio uuid,p_event uuid,p_fx jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare event public.finance_project_earning_events; milestone public.finance_project_earning_milestones; result uuid; problem text;
  entry public.finance_recognition_entries; current_terms uuid;
begin
  select * into event from public.finance_project_earning_events where studio_id=p_studio and id=p_event;
  select * into milestone from public.finance_project_earning_milestones where studio_id=p_studio and id=event.milestone_id;
  if event.id is null or milestone.id is null then raise exception 'finance_earning_event_invalid';end if;
  if event.kind<>milestone.condition then return null;end if;
  select * into entry from public.finance_recognition_entries where studio_id=p_studio and earning_event_id=p_event and kind='recognition' order by created_at,id limit 1;
  if entry.id is not null then
    if entry.reporting_amount is null and p_fx is not null and p_fx<>'null'::jsonb then perform private.value_finance_expense_recognition(p_studio,entry.id,p_fx);end if;
    return entry.id;
  end if;
  begin
    select id into current_terms from public.finance_project_current_terms where studio_id=p_studio and order_id=milestone.order_id and stream='design';
    result:=private.post_finance_recognition_core(p_studio,jsonb_build_object('sourceKind','project_terms','sourceId',current_terms,'projectId',milestone.project_id,
      'classification','revenue','amount',milestone.net_amount,'periodStart',event.occurred_on,'periodEnd',event.occurred_on,'date',event.occurred_on,
      'description',milestone.title,'reason','Confirmed contractual '||event.kind,'fx',p_fx,'earningEventId',event.id),event.confirmed_by,null,null);
  exception when raise_exception then
    problem:=sqlerrm;
    if problem not like 'finance_%' then raise;end if;
  end;
  insert into public.finance_project_earning_attempts(studio_id,event_id,entry_id,exception,attempted_by)
    values(p_studio,p_event,result,problem,coalesce(auth.uid(),event.confirmed_by));
  return result;
end $$;

-- Discovery and processing share the same eligibility rules. A stale candidate
-- cannot cross activation, review or immutable source-history boundaries.
create function private.finance_pending_source_candidates(p_studio uuid) returns setof jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('action','earning','studioId',e.studio_id,'sourceId',e.id,
    'currency',coalesce(root.currency,t.currency),'reportingCurrency',coalesce(root.reporting_currency,s.base_currency),'to',e.occurred_on)
  from public.finance_project_earning_events e
  join public.finance_project_earning_milestones m on m.studio_id=e.studio_id and m.id=e.milestone_id and m.active and m.condition=e.kind
  join public.finance_project_terms t on t.studio_id=m.studio_id and t.id=m.terms_id
  join public.finance_settings s on s.studio_id=e.studio_id and s.finalized_at is not null
  left join lateral(select r.* from public.finance_recognition_entries r where r.studio_id=e.studio_id and r.earning_event_id=e.id
    and r.kind='recognition' order by r.created_at,r.id limit 1) root on true
  left join lateral(select a.exception from public.finance_project_earning_attempts a where a.studio_id=e.studio_id and a.event_id=e.id
    order by a.created_at desc,a.id desc limit 1) attempt on true
  where e.studio_id=p_studio and e.occurred_on between s.recognition_start_month and (now() at time zone 'Europe/Kyiv')::date
    and not exists(select 1 from public.finance_project_earning_events v where v.studio_id=e.studio_id and v.milestone_id=m.id and v.kind='void')
    and (root.id is null and (attempt.exception is null or attempt.exception in
      ('finance_recognition_inactive','finance_fx_required','finance_fx_unavailable','finance_recognition_source_invalid'))
      or root.reporting_amount is null and root.id is not null
        and exists(select 1 from public.finance_recognized_actuals r where r.studio_id=e.studio_id and r.id=root.id))
  union all
  select jsonb_build_object('action','trip','studioId',e.studio_id,'sourceId',e.id,
    'currency',null,'reportingCurrency',e.reporting_currency,'to',e.financial_date)
  from public.finance_trip_entries e
  join public.finance_trips t on t.studio_id=e.studio_id and t.id=e.trip_id
  join public.finance_settings s on s.studio_id=e.studio_id and s.finalized_at is not null
  where e.studio_id=p_studio and e.kind='expense' and e.reverses_id is null
    and e.financial_date between s.recognition_start_month and (now() at time zone 'Europe/Kyiv')::date
    and not private.finance_expense_period_reviewed(e.studio_id,t.project_id,e.financial_date,e.financial_date)
    and not exists(select 1 from public.finance_movements effect where effect.studio_id=e.studio_id
      and (effect.related_movement_id=e.movement_id or effect.related_movement_id in
        (select id from public.finance_movements where studio_id=e.studio_id and related_movement_id=e.movement_id))
      and private.finance_expense_period_reviewed(e.studio_id,t.project_id,effect.financial_date,effect.financial_date))
    and not exists(select 1 from public.finance_recognition_entries r where r.studio_id=e.studio_id and r.trip_entry_id=e.id and r.kind='recognition')
    and not exists(select 1 from public.finance_recognition_entries r where r.studio_id=e.studio_id and r.source_kind<>'trip'
      and (r.movement_id=e.movement_id or e.expected_item_id is not null
        and (r.expected_item_id=private.finance_recognition_expected_root(e.studio_id,e.expected_item_id)
          or r.source_snapshot->>'economicExpectedId'=private.finance_recognition_expected_root(e.studio_id,e.expected_item_id)::text)))
$$;
revoke all on function private.finance_pending_source_candidates(uuid) from public,anon,authenticated,service_role;

create function public.process_finance_pending_source(p_studio_id uuid,p_kind text,p_source_id uuid,p_fx jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; actor uuid;
begin
  if auth.role() is distinct from 'service_role' and not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.studio_members where studio_id=p_studio_id order by user_id for share;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if not exists(select 1 from private.finance_pending_source_candidates(p_studio_id) c
    where c->>'action'=p_kind and c->>'sourceId'=p_source_id::text) then return null;end if;
  if p_kind='earning' then
    return private.recognize_finance_earning_event(p_studio_id,p_source_id,p_fx);
  elsif p_kind='trip' then
    select created_by into actor from public.finance_trip_entries where studio_id=p_studio_id and id=p_source_id;
    result:=private.capture_finance_trip_fact(p_studio_id,p_source_id,'Reconciled confirmed actual trip expense',actor);
  end if;
  return result;
end $$;
revoke all on function public.process_finance_pending_source(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.process_finance_pending_source(uuid,text,uuid,jsonb) to authenticated,service_role;

alter function public.prepare_finance_automatic_expenses(uuid) rename to prepare_finance_automatic_expenses_before_pending;
alter function public.prepare_finance_automatic_expenses_before_pending(uuid) set schema private;
revoke all on function private.prepare_finance_automatic_expenses_before_pending(uuid) from public,anon,authenticated,service_role;
create function public.prepare_finance_automatic_expenses(p_studio_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; studio uuid;
begin
  -- Retains the existing worker/admin authorization and service accrual drain.
  result:=private.prepare_finance_automatic_expenses_before_pending(p_studio_id);
  for studio in select studio_id from public.finance_settings where recognition_start_month is not null
    and (p_studio_id is null or studio_id=p_studio_id) order by studio_id loop
    result:=result||coalesce((select jsonb_agg(c) from private.finance_pending_source_candidates(studio) c),'[]');
  end loop;
  return result;
end $$;
revoke all on function public.prepare_finance_automatic_expenses(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_finance_automatic_expenses(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
