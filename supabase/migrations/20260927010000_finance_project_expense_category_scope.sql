-- One global Finance category can be offered in Project Expenses without changing
-- its accounting nature, reporting, or historical ledger snapshots.
alter table public.finance_categories add column if not exists project_expense_enabled boolean not null default false;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='finance_categories_project_expense_scope_check') then
    alter table public.finance_categories add constraint finance_categories_project_expense_scope_check
      check(not project_expense_enabled or (direction='outgoing' and nature='operating'));
  end if;
end $$;

create or replace function private.seed_project_expense_categories(p_studio_id uuid) returns void
language sql security definer set search_path='' as $$
  insert into public.finance_categories(studio_id,name,direction,nature,default_key,custom_name,project_expense_enabled)
  select p_studio_id,v.name,'outgoing','operating',v.key,false,true from (values
    ('project_outsourcing','Outsourcing / contractors'),
    ('project_measurements','Measurements'),
    ('project_materials','Materials / purchases'),
    ('project_services','Services / works'),
    ('project_other_expense','Other project expense')
  ) v(key,name)
  on conflict(studio_id,default_key) do update set project_expense_enabled=true;
$$;
revoke all on function private.seed_project_expense_categories(uuid) from public,anon,authenticated,service_role;
create or replace function private.seed_new_project_expense_categories() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.seed_project_expense_categories(new.studio_id); return new; end;
$$;
revoke all on function private.seed_new_project_expense_categories() from public,anon,authenticated,service_role;
drop trigger if exists finance_project_expense_category_defaults on public.finance_settings;
create trigger finance_project_expense_category_defaults after insert on public.finance_settings
for each row execute function private.seed_new_project_expense_categories();
select private.seed_project_expense_categories(studio_id) from public.finance_settings;

create or replace function public.save_finance_category(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','category','input',p_input); result uuid; old public.finance_categories;
  project_scope boolean;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  result:=coalesce(nullif(p_input->>'id','')::uuid,gen_random_uuid());
  select * into old from public.finance_categories where studio_id=p_studio_id and id=result;
  project_scope:=coalesce((p_input->>'projectExpenseEnabled')::boolean,old.project_expense_enabled,false);
  if project_scope and (p_input->>'direction'<>'outgoing' or p_input->>'nature'<>'operating')
    then raise exception 'finance_category_invalid'; end if;
  if found then
    if old.direction is distinct from p_input->>'direction' or old.nature is distinct from p_input->>'nature'
      then raise exception 'finance_category_semantics_immutable'; end if;
    update public.finance_categories set name=btrim(p_input->>'name'),project_expense_enabled=project_scope,
      custom_name=old.custom_name or old.name is distinct from btrim(p_input->>'name'),
      archived_at=case when (p_input->>'archived')::boolean then coalesce(old.archived_at,now()) else null end
      where studio_id=p_studio_id and id=result;
  else
    if nullif(p_input->>'id','') is not null then raise exception 'finance_category_invalid'; end if;
    insert into public.finance_categories(id,studio_id,name,direction,nature,project_expense_enabled)
    values(result,p_studio_id,btrim(p_input->>'name'),p_input->>'direction',p_input->>'nature',project_scope);
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

create or replace function private.guard_finance_project_expected() returns trigger
language plpgsql security definer set search_path='' as $$
declare link public.finance_project_items; terms public.finance_project_terms; scheduled numeric;
begin
  select * into link from public.finance_project_items where studio_id=old.studio_id and expected_item_id=old.id;
  if not found then return new; end if;
  if (link.stream='expenses' and new.direction<>'outgoing')
    or (link.stream<>'expenses' and new.direction<>'incoming')
    then raise exception 'finance_project_direction_required'; end if;
  if link.stream='expenses' and (not exists(select 1 from public.finance_categories c where c.studio_id=new.studio_id
      and c.id=new.category_id and c.direction='outgoing' and c.nature='operating')
    or (new.category_id is distinct from old.category_id and not exists(
      select 1 from public.finance_categories c where c.studio_id=new.studio_id
        and c.id=new.category_id and c.project_expense_enabled)))
    then raise exception 'finance_project_expense_invalid'; end if;
  if exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
    and row(new.amount,new.currency,new.direction,new.category_id,new.due_date,new.certainty)
      is distinct from row(old.amount,old.currency,old.direction,old.category_id,old.due_date,old.certainty)
    then raise exception 'finance_project_settled_terms_locked'; end if;
  if new.commitment is distinct from old.commitment then
    if new.commitment='cancelled' then
      if exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id having sum(amount)<>0)
        or not exists(select 1 from public.finance_planning_requests where studio_id=old.studio_id
          and payload->>'operation'='project_cancellation' and payload->'input'->>'itemId'=old.id::text
          and (payload->'input'->>'version')::integer=old.version)
        then raise exception 'finance_project_cancellation_required'; end if;
    elsif old.commitment='cancelled' or exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
      then raise exception 'finance_project_settled_terms_locked'; end if;
  end if;
  if link.stream='design' then
    select * into terms from public.finance_project_current_terms where studio_id=old.studio_id and project_id=link.project_id and stream='design';
    select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=old.studio_id and project_id=link.project_id and stream='design' and commitment<>'cancelled' and id<>old.id;
    if new.currency<>terms.currency then raise exception 'finance_project_currency_locked'; end if;
    if scheduled+(case when new.commitment='cancelled' then 0 else new.amount end)>terms.amount then raise exception 'finance_project_over_scheduled'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.save_finance_project_item(p_studio_id uuid,p_request_id uuid,p_project_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','project_item','project',p_project_id,'input',p_input);
  result uuid; item_id uuid; terms public.finance_project_terms; link public.finance_project_items;
  visit public.calendar_events; contractor_name text; contractor_studio uuid; scheduled numeric;
  v_stream text:=p_input->>'stream'; source text:=coalesce(p_input->>'source','manual'); item jsonb:=p_input->'item';
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.projects where studio_id=p_studio_id and id=p_project_id) then raise exception 'finance_project_invalid'; end if;
  if v_stream='expenses' then
    if item->>'direction' is distinct from 'outgoing' or source<>'manual'
      or not exists(select 1 from public.finance_categories c where c.studio_id=p_studio_id
        and c.id=(item->>'categoryId')::uuid and c.direction='outgoing' and c.nature='operating')
      or (nullif(item->>'id','') is null and not exists(
        select 1 from public.finance_categories c where c.studio_id=p_studio_id
          and c.id=(item->>'categoryId')::uuid and c.project_expense_enabled))
      then raise exception 'finance_project_expense_invalid'; end if;
  elsif item->>'direction' is distinct from 'incoming' then
    raise exception 'finance_project_income_required';
  end if;
  item_id:=nullif(item->>'id','')::uuid;
  if item_id is not null then
    select * into link from public.finance_project_items where studio_id=p_studio_id and expected_item_id=item_id and project_id=p_project_id;
    if not found then raise exception 'finance_project_invalid'; end if;
    -- Source identities are permanent, including after a refund/cancellation.
    if v_stream is distinct from link.stream then raise exception 'finance_project_context_locked'; end if;
  else
    if source not in ('manual','visit') then raise exception 'finance_project_source_invalid'; end if;
    select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream=v_stream;
    if v_stream='design' then
      if terms.id is null then raise exception 'finance_project_agreement_required'; end if;
      if terms.currency is distinct from item->>'currency' then raise exception 'finance_project_currency_locked'; end if;
      select coalesce(sum(amount),0) into scheduled from public.finance_project_expected_balances where studio_id=p_studio_id and project_id=p_project_id and finance_project_expected_balances.stream='design' and commitment<>'cancelled';
      if scheduled+(case when item->>'commitment'='cancelled' then 0 else (item->>'amount')::numeric end)>terms.amount then raise exception 'finance_project_over_scheduled'; end if;
    end if;
    if source='visit' then
      select * into visit from public.calendar_events where id=(p_input->>'visitId')::uuid and studio_id=p_studio_id and project_id=p_project_id and event_type='site_visit' and cancelled_at is null for share;
      if not found or v_stream<>'supervision' then raise exception 'finance_project_visit_invalid'; end if;
      -- Select the terms that actually apply to the visit, not today's rate.
      select * into terms from public.finance_project_terms where studio_id=p_studio_id and project_id=p_project_id and finance_project_terms.stream='supervision'
        and effective_from<=(visit.starts_at at time zone 'Europe/Kyiv')::date order by effective_from desc,revision desc limit 1;
      if terms.id is null or terms.mode not in ('per_visit','monthly') or (terms.effective_through is not null and terms.effective_through<(visit.starts_at at time zone 'Europe/Kyiv')::date)
        or (terms.mode='monthly' and not coalesce((p_input->>'extraVisit')::boolean,false)) then raise exception 'finance_project_visit_not_billable'; end if;
      -- Contract defaults must still match the applicable revision at submission.
      -- Explicit manual prices remain supported and are recorded in the request.
      if p_input->>'visitPricing'='contract' and (terms.mode<>'per_visit'
        or terms.id is distinct from nullif(p_input->>'visitTermsId','')::uuid
        or terms.amount is distinct from (item->>'amount')::numeric or terms.currency is distinct from item->>'currency')
        then raise exception 'finance_project_visit_price_changed'; end if;
    end if;
    if nullif(p_input->>'contractorId','') is not null then
      select c.name,g.studio_id into contractor_name,contractor_studio from public.contractors c join public.contractor_categories g on g.id=c.category_id where c.id=(p_input->>'contractorId')::uuid for share of c;
      if contractor_studio is distinct from p_studio_id or v_stream<>'contractor_bonus' then raise exception 'finance_project_contractor_invalid'; end if;
    end if;
  end if;
  result:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),item);
  if item_id is null then
    insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream,terms_id,source,visit_id,contractor_id,context_label,extra_visit)
    values(p_studio_id,result,p_project_id,v_stream,terms.id,source,visit.id,nullif(p_input->>'contractorId','')::uuid,
      coalesce(contractor_name,case when visit.id is not null then visit.title||' · '||(visit.starts_at at time zone 'Europe/Kyiv')::date::text end,''),coalesce((p_input->>'extraVisit')::boolean,false));
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;
