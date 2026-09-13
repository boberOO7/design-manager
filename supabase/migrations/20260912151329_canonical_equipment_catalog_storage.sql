-- This cutover is intentionally pre-import only. Keeping migration history intact is
-- safer than editing the original catalog migration, while the guard prevents data loss.
do $$
begin
  if exists (select 1 from public.equipment_catalog_products) then
    raise exception 'canonical_catalog_cutover_requires_empty_product_catalog';
  end if;
end;
$$;

drop function public.search_equipment_catalog(text,text,text,text,text);
drop function public.import_equipment_catalog_batch(text,uuid,timestamp,jsonb);
drop function public.finish_equipment_catalog_sync(text,uuid,timestamp,text);
drop table public.equipment_catalog_products;

-- One row per StudioFlow autocomplete identity. Provider SKU state lives separately.
create table public.equipment_catalog_models (
  id bigint generated always as identity primary key,
  catalog_type text not null check (catalog_type in ('pc','laptop','monitor','mouse','keyboard','headphones','webcam','printer','air_conditioner','coffee_machine','cpu','gpu')),
  manufacturer text not null check (length(manufacturer) between 1 and 160 and manufacturer = regexp_replace(btrim(manufacturer), '[[:space:]]+', ' ', 'g')),
  model text not null check (length(model) between 1 and 160 and model = regexp_replace(btrim(model), '[[:space:]]+', ' ', 'g')),
  family text check (length(family) between 1 and 160 and family = regexp_replace(btrim(family), '[[:space:]]+', ' ', 'g')),
  is_current boolean not null default true,
  on_market boolean,
  popularity bigint not null default 0 check (popularity >= 0),
  provider_product_count bigint not null default 0 check (provider_product_count >= 0),
  source_updated_at timestamp not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  search_manufacturer text generated always as (lower(manufacturer)) stored,
  search_model text generated always as (lower(model)) stored,
  search_family text generated always as (lower(family)) stored,
  unique (catalog_type, search_manufacturer, search_model)
);
create index equipment_catalog_model_context_idx on public.equipment_catalog_models (catalog_type, search_manufacturer, search_family);
create index equipment_catalog_model_prefix_idx on public.equipment_catalog_models (catalog_type, search_model text_pattern_ops);
create index equipment_catalog_model_trgm_idx on public.equipment_catalog_models using gin (search_model extensions.gin_trgm_ops);

-- Synchronization state only. Do not add autocomplete text or fuzzy indexes here.
create table public.equipment_catalog_provider_products (
  source text not null check (source ~ '^[a-z][a-z0-9_]{0,39}$'),
  source_product_id text not null check (length(source_product_id) between 1 and 100),
  catalog_model_id bigint not null references public.equipment_catalog_models(id),
  is_current boolean not null default true,
  on_market boolean,
  popularity bigint not null default 0 check (popularity >= 0),
  -- Icecat supplies wall-clock timestamps without an unambiguous timezone.
  source_updated_at timestamp not null,
  source_seen_at timestamp not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (source, source_product_id)
);
create index equipment_catalog_provider_model_idx on public.equipment_catalog_provider_products (catalog_model_id);

alter table public.equipment_catalog_models enable row level security;
alter table public.equipment_catalog_provider_products enable row level security;
revoke all on public.equipment_catalog_models, public.equipment_catalog_provider_products from public, anon, authenticated, service_role;
revoke all on sequence public.equipment_catalog_models_id_seq from public, anon, authenticated, service_role;
grant select on public.equipment_catalog_models to authenticated;
grant select, insert, update on public.equipment_catalog_models, public.equipment_catalog_provider_products to service_role;
grant usage, select on sequence public.equipment_catalog_models_id_seq to service_role;

create policy equipment_catalog_model_admin_read on public.equipment_catalog_models for select to authenticated
using ((select count(*) = 1 and bool_and(m.system_role = 'admin') from public.studio_members m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.user_id = (select auth.uid()) and m.is_active));

create function public.search_equipment_catalog(p_type text, p_query text, p_manufacturer text default '', p_family text default '', p_field text default 'model')
returns table (value text)
language plpgsql stable security invoker set search_path = ''
set statement_timeout = '2s'
as $$
declare
  q text := lower(regexp_replace(btrim(coalesce(p_query, '')), '[[:space:]]+', ' ', 'g'));
  manufacturer_query text := lower(regexp_replace(btrim(coalesce(p_manufacturer, '')), '[[:space:]]+', ' ', 'g'));
  family_query text := lower(regexp_replace(btrim(coalesce(p_family, '')), '[[:space:]]+', ' ', 'g'));
  pattern text;
begin
  if length(q) > 160 or length(coalesce(p_manufacturer,'')) > 160 or length(coalesce(p_family,'')) > 160 then
    raise exception 'invalid_catalog_query';
  end if;
  pattern := replace(replace(replace(q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  if p_field = 'manufacturer' then
    return query select m.name from public.equipment_catalog_manufacturers m
      where m.catalog_type = p_type and (q = '' or m.search_name like '%' || pattern || '%')
      order by (m.search_name = q) desc, (m.search_name like pattern || '%') desc,
        m.popularity desc, m.product_count desc, m.name limit 10;
  elsif p_field = 'model' then
    if length(q) < 2 then return; end if;
    return query select m.model from public.equipment_catalog_models m
      where m.catalog_type = p_type
        and (manufacturer_query = '' or m.search_manufacturer = manufacturer_query)
        and (family_query = '' or m.search_family = family_query)
        and (m.search_model like pattern || '%' or
          (length(q) >= 3 and (m.search_model like '%' || pattern || '%' or m.search_model operator(extensions.%) q)))
      order by case when m.search_model = q then 0 when m.search_model like pattern || '%' then 1
          when m.search_model like '%' || pattern || '%' then 2 else 3 end,
        (m.is_current and coalesce(m.on_market, true)) desc, m.is_current desc,
        extensions.similarity(m.search_model, q) desc, m.popularity desc, m.model limit 12;
  else raise exception 'invalid_catalog_field';
  end if;
end;
$$;
revoke all on function public.search_equipment_catalog(text,text,text,text,text) from public, anon;
grant execute on function public.search_equipment_catalog(text,text,text,text,text) to authenticated, service_role;

create function public.import_equipment_catalog_batch(p_source text, p_run_id uuid, p_generation timestamp, p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  existing_provider public.equipment_catalog_provider_products%rowtype;
  old_model_id bigint;
  new_model_id bigint;
  affected_model_ids bigint[] := '{}';
  incoming_updated timestamp;
  canonical_manufacturer text;
  canonical_model text;
  canonical_family text;
begin
  perform 1 from public.equipment_catalog_sync_state where source = p_source and run_id = p_run_id and lease_until > now() for update;
  if not found then raise exception 'catalog_sync_lease_lost'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'invalid_catalog_batch'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    incoming_updated := (r->>'source_updated_at')::timestamp;
    select * into existing_provider from public.equipment_catalog_provider_products
      where source = p_source and source_product_id = r->>'source_product_id' for update;

    if found and (existing_provider.source_seen_at > p_generation or existing_provider.source_updated_at > incoming_updated) then
      continue;
    end if;

    if r->>'is_current' = 'false' then
      if found then
        update public.equipment_catalog_provider_products set is_current = false, on_market = false,
          source_seen_at = p_generation, source_updated_at = incoming_updated, last_seen_at = now()
        where source = p_source and source_product_id = r->>'source_product_id';
        affected_model_ids := array_append(affected_model_ids, existing_provider.catalog_model_id);
      end if;
      continue;
    end if;

    old_model_id := case when found then existing_provider.catalog_model_id end;
    canonical_manufacturer := regexp_replace(btrim(coalesce(r->>'component_vendor', r->>'manufacturer')), '[[:space:]]+', ' ', 'g');
    canonical_model := regexp_replace(btrim(coalesce(r->>'component_model', r->>'model')), '[[:space:]]+', ' ', 'g');
    canonical_family := nullif(regexp_replace(btrim(coalesce(r->>'family', '')), '[[:space:]]+', ' ', 'g'), '');

    insert into public.equipment_catalog_models as m
      (catalog_type, manufacturer, model, family, source_updated_at)
    values (r->>'catalog_type', canonical_manufacturer, canonical_model, canonical_family, incoming_updated)
    on conflict (catalog_type, search_manufacturer, search_model) do update
      set family = coalesce(m.family, excluded.family), last_seen_at = now()
    returning id into new_model_id;

    insert into public.equipment_catalog_provider_products as p
      (source, source_product_id, catalog_model_id, is_current, on_market, popularity, source_updated_at, source_seen_at)
    values (p_source, r->>'source_product_id', new_model_id, true, (r->>'on_market')::boolean,
      coalesce((r->>'popularity')::bigint, 0), incoming_updated, p_generation)
    on conflict (source, source_product_id) do update set
      catalog_model_id = excluded.catalog_model_id, is_current = true, on_market = excluded.on_market,
      popularity = excluded.popularity, source_updated_at = excluded.source_updated_at,
      source_seen_at = excluded.source_seen_at, last_seen_at = now();

    if old_model_id is not null then affected_model_ids := array_append(affected_model_ids, old_model_id); end if;
    affected_model_ids := array_append(affected_model_ids, new_model_id);
  end loop;

  if cardinality(affected_model_ids) > 0 then
    perform 1 from public.equipment_catalog_models
      where id = any(affected_model_ids) order by id for update;
    update public.equipment_catalog_models m set
      is_current = a.is_current,
      on_market = a.on_market,
      popularity = a.popularity,
      provider_product_count = a.provider_product_count,
      source_updated_at = coalesce(a.source_updated_at, m.source_updated_at),
      last_seen_at = now()
    from (
      select affected.id,
        coalesce(bool_or(p.is_current), false) as is_current,
        case when bool_or(p.is_current and p.on_market is true) then true
          when bool_or(p.is_current and p.on_market is null) then null else false end as on_market,
        coalesce(max(p.popularity) filter (where p.is_current), 0) as popularity,
        count(p.source_product_id) as provider_product_count,
        max(p.source_updated_at) as source_updated_at
      from (select distinct unnest(affected_model_ids) as id) affected
      left join public.equipment_catalog_provider_products p on p.catalog_model_id = affected.id
      group by affected.id
    ) a
    where m.id = a.id;
  end if;

  update public.equipment_catalog_sync_state set lease_until = now() + interval '10 minutes' where source = p_source and run_id = p_run_id;
end;
$$;

create function public.finish_equipment_catalog_sync(p_source text, p_run_id uuid, p_generation timestamp, p_error text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.equipment_catalog_sync_state where source = p_source and run_id = p_run_id and lease_until > now() for update;
  if not found then raise exception 'catalog_sync_lease_lost'; end if;
  if p_error is null then
    if p_generation is null then raise exception 'catalog_generation_required'; end if;
    delete from public.equipment_catalog_manufacturers;
    insert into public.equipment_catalog_manufacturers(catalog_type, name, popularity, product_count)
      select catalog_type, min(manufacturer), sum(popularity), count(*)
      from public.equipment_catalog_models where catalog_type not in ('cpu', 'gpu')
      group by catalog_type, search_manufacturer;
  end if;
  update public.equipment_catalog_sync_state set run_id = null, lease_until = null,
    completed_generation = case when p_error is null then greatest(completed_generation, p_generation) else completed_generation end,
    last_completed_at = case when p_error is null then now() else last_completed_at end,
    last_error = left(p_error, 500)
  where source = p_source and run_id = p_run_id;
end;
$$;
revoke all on function public.import_equipment_catalog_batch(text,uuid,timestamp,jsonb), public.finish_equipment_catalog_sync(text,uuid,timestamp,text) from public, anon, authenticated;
grant execute on function public.import_equipment_catalog_batch(text,uuid,timestamp,jsonb), public.finish_equipment_catalog_sync(text,uuid,timestamp,text) to service_role;
