-- Payment presentation metadata stays on the authoritative Finance payment row.
alter table public.finance_expected_items
  add column client_note text check (char_length(client_note) <= 300),
  add column schedule_percentage numeric check (schedule_percentage > 0 and schedule_percentage <= 100 and schedule_percentage = round(schedule_percentage,4));

create or replace view public.finance_project_plan_items with(security_invoker=true) as
select b.id,b.studio_id,b.direction,b.amount,b.currency,b.category_id,b.description,b.due_date,b.expected_payment_date,
  b.commitment,b.certainty,b.is_established,b.version,b.created_by,b.created_at,b.updated_at,b.settled_amount,b.remaining_amount,
  b.payment_state,b.due_state,b.outstanding_amount,b.project_id,b.stream,b.source,b.period_start,b.visit_id,b.contractor_id,b.context_label,
  exists(select 1 from public.finance_allocations a where a.studio_id=b.studio_id and a.expected_item_id=b.id) as has_settlement_history,
  b.vat_rate,b.price_basis,b.net_amount,b.vat_amount,e.client_note,e.schedule_percentage
from public.finance_project_expected_balances b join public.finance_expected_items e on e.studio_id=b.studio_id and e.id=b.id where b.stream='design' and b.commitment<>'cancelled';

-- Preserve the current money/security implementation; extend only its metadata write.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.save_finance_project_plan(uuid,uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('ordered:=array_append(ordered,item_id);' in definition)=0 then
    raise exception 'Proposal metadata migration: unexpected payment builder definition';
  end if;
  definition:=replace(definition,'ordered:=array_append(ordered,item_id);',
    'update public.finance_expected_items set
       client_note=nullif(btrim(p_input->''items''->cardinality(ordered)->>''clientNote''),''''),
       schedule_percentage=case when protected=0 and scheduled=gross_total then nullif(p_input->''items''->cardinality(ordered)->>''percentage'','''')::numeric else nullif(round(amount/gross_total*100,4),0) end
     where studio_id=p_studio_id and id=item_id;
     ordered:=array_append(ordered,item_id);');
  definition:=replace(definition,'if known is distinct from supplied_known then raise exception ''finance_version_conflict''; end if;',
    'if known is distinct from supplied_known then raise exception ''finance_version_conflict''; end if;
     for row_input in select value from jsonb_array_elements(coalesce(p_input->''protectedNotes'',''[]''::jsonb)) loop
       if not exists(select 1 from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id and id=(row_input->>''id'')::uuid and has_settlement_history) then raise exception ''finance_project_invalid''; end if;
       update public.finance_expected_items set client_note=nullif(btrim(row_input->>''clientNote''),''''),version=version+1,updated_at=now()
         where studio_id=p_studio_id and id=(row_input->>''id'')::uuid and client_note is distinct from nullif(btrim(row_input->>''clientNote''),'''');
     end loop;');
  execute definition;
end;
$migration$;

-- Amount edits outside the percentage builder must not keep an obsolete share.
create function private.clear_payment_percentage() returns trigger language plpgsql set search_path='' as $$
begin
  if new.amount is distinct from old.amount then new.schedule_percentage:=null; end if;
  return new;
end;
$$;
create trigger finance_payment_percentage before update on public.finance_expected_items
for each row execute function private.clear_payment_percentage();
revoke all on function private.clear_payment_percentage() from public,anon,authenticated,service_role;

-- A retained payment's old percentage is obsolete when the contract total changes.
create function private.clear_amended_payment_percentages() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.stream='design' and exists(select 1 from public.finance_project_terms t
    where t.studio_id=new.studio_id and t.project_id=new.project_id and t.stream='design'
      and t.revision=new.revision-1 and t.gross_amount is distinct from new.gross_amount) then
    update public.finance_expected_items e set schedule_percentage=null
      where e.studio_id=new.studio_id and e.schedule_percentage is not null and exists(
        select 1 from public.finance_project_items p where p.studio_id=e.studio_id and p.expected_item_id=e.id and p.project_id=new.project_id and p.stream='design');
  end if;
  return new;
end;
$$;
revoke all on function private.clear_amended_payment_percentages() from public,anon,authenticated,service_role;
create trigger finance_amended_payment_percentages after insert on public.finance_project_terms
for each row execute function private.clear_amended_payment_percentages();

create table public.finance_project_proposals (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  project_id uuid not null,
  revision integer not null check(revision>0),
  request_id uuid not null,
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  pdf bytea not null check(octet_length(pdf) between 5 and 10485760 and substring(pdf from 1 for 5)=decode('255044462d','hex')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(studio_id,project_id,revision), unique(studio_id,request_id),
  foreign key(project_id,studio_id) references public.projects(id,studio_id) on delete restrict
);
create index finance_proposal_creator_idx on public.finance_project_proposals(created_by);
alter table public.finance_project_proposals enable row level security;
revoke all on public.finance_project_proposals from public,anon,authenticated,service_role;
grant select on public.finance_project_proposals to authenticated;
create policy finance_proposal_admin on public.finance_project_proposals for select to authenticated
using((select private.is_finance_admin(studio_id)));
create trigger finance_proposal_immutable before update or delete on public.finance_project_proposals
for each row execute function private.reject_finance_history_change();

-- Explicit client-facing allowlist: internal tax/reporting values never leave Finance.
create function private.finance_proposal_source(p_studio_id uuid,p_project_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare project public.projects; terms public.finance_project_terms; pricing public.finance_project_plan_revisions;
  lead public.crm_leads; number text; next_revision integer; rows jsonb; digits integer;
begin
  select * into project from public.projects where studio_id=p_studio_id and id=p_project_id;
  select * into terms from public.finance_project_current_terms where studio_id=p_studio_id and project_id=p_project_id and stream='design';
  if project.id is null or terms.id is null then raise exception 'finance_project_agreement_required'; end if;
  select * into pricing from public.finance_project_plan_revisions where terms_id=terms.id;
  select * into lead from public.crm_leads where studio_id=p_studio_id and project_id=p_project_id;
  select snapshot->>'projectNumber' into number from public.finance_project_proposals
    where studio_id=p_studio_id and project_id=p_project_id order by revision limit 1;
  number:=coalesce(number,substring(btrim(project.name) from '^([0-9]+)(?:[[:space:]_–—-]|$)'));
  if number is null then raise exception 'finance_proposal_number_required'; end if;
  select coalesce(max(revision),0)+1 into next_revision from public.finance_project_proposals where studio_id=p_studio_id and project_id=p_project_id;
  select minor_units into digits from public.finance_currencies where code=terms.currency;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.description,'gross',i.amount::text,
    'percentage',coalesce(e.schedule_percentage,round(i.amount/terms.gross_amount*100,4))::text,
    'note',coalesce(e.client_note,'')) order by coalesce(array_position(pricing.item_order,i.id),2147483647),i.due_date nulls last,i.id),'[]')
    into rows from public.finance_project_plan_items i join public.finance_expected_items e on e.studio_id=i.studio_id and e.id=i.id
    where i.studio_id=p_studio_id and i.project_id=p_project_id;
  return jsonb_build_object('schemaVersion',1,'projectId',project.id,'projectNumber',number,'revision',next_revision,
    'date',((now() at time zone 'Europe/Kyiv')::date)::text,'projectTitle',project.name,
    'clientName',coalesce(project.client_name,lead.client_name,''),'contact',concat_ws(' · ',nullif(lead.company,''),nullif(lead.email,''),nullif(lead.phone,'')),
    'address',concat_ws(', ',nullif(project.city,''),nullif(project.site_address,'')),
    'area',coalesce(pricing.area_snapshot,project.total_area_m2)::text,
    'currency',terms.currency,'minorUnits',digits,'gross',terms.gross_amount::text,
    'vatRate',terms.vat_rate::text,'vatAmount',terms.vat_amount::text,'rows',rows,'intro','');
end;
$$;
revoke all on function private.finance_proposal_source(uuid,uuid) from public,anon,authenticated,service_role;
create function public.get_finance_proposal_source(p_studio_id uuid,p_project_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(private.is_finance_admin(p_studio_id),false) then raise exception 'finance_forbidden'; end if;
  return private.finance_proposal_source(p_studio_id,p_project_id);
end;
$$;
revoke all on function public.get_finance_proposal_source(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_proposal_source(uuid,uuid) to authenticated;

create function public.save_finance_project_proposal(p_studio_id uuid,p_project_id uuid,p_request_id uuid,p_source jsonb,p_presentation jsonb,p_pdf text,p_actor_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.finance_project_proposals; source jsonb; result uuid; field text;
begin
  -- Only the trusted renderer may save bytes. Verify its audited actor again in SQL.
  if p_actor_id is null or not exists(select 1 from public.studio_members m join public.profiles p on p.id=m.user_id
    where m.studio_id=p_studio_id and m.user_id=p_actor_id and m.system_role='admin' and m.is_active and p.is_active)
    or (select count(*) from public.studio_members where user_id=p_actor_id and is_active)<>1 then raise exception 'finance_forbidden'; end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  select * into old from public.finance_project_proposals where studio_id=p_studio_id and request_id=p_request_id;
  if old.id is not null then
    if old.project_id<>p_project_id or old.snapshot is distinct from p_source||p_presentation then raise exception 'finance_request_conflict'; end if;
    return old.id;
  end if;
  if p_source is null or jsonb_typeof(p_presentation) is distinct from 'object' or
    exists(select 1 from jsonb_object_keys(p_presentation) k where k not in ('projectTitle','clientName','contact','address','intro')) then raise exception 'finance_input_invalid'; end if;
  foreach field in array array['projectTitle','clientName','contact','address','intro'] loop
    if jsonb_typeof(p_presentation->field) is distinct from 'string' or char_length(p_presentation->>field)>(case when field in ('intro','contact','address') then 1000 else 500 end) then raise exception 'finance_input_invalid'; end if;
  end loop;
  if char_length(btrim(p_presentation->>'projectTitle'))=0 then raise exception 'finance_input_invalid'; end if;
  perform 1 from public.projects where studio_id=p_studio_id and id=p_project_id for update;
  perform 1 from public.crm_leads where studio_id=p_studio_id and project_id=p_project_id for update;
  perform 1 from public.finance_expected_items where studio_id=p_studio_id and id in
    (select id from public.finance_project_plan_items where studio_id=p_studio_id and project_id=p_project_id) order by id for update;
  source:=private.finance_proposal_source(p_studio_id,p_project_id);
  if source is distinct from p_source then raise exception 'finance_version_conflict'; end if;
  insert into public.finance_project_proposals(studio_id,project_id,revision,request_id,snapshot,pdf,created_by)
    values(p_studio_id,p_project_id,(source->>'revision')::integer,p_request_id,source||p_presentation,decode(p_pdf,'base64'),p_actor_id) returning id into result;
  return result;
end;
$$;
revoke all on function public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid) to service_role;
