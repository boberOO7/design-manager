-- Shared reference data only: deliberately no inventory or studio foreign keys.
create extension if not exists pg_trgm with schema extensions;
create table public.equipment_catalog_products (
  source text not null check (source ~ '^[a-z][a-z0-9_]{0,39}$'),
  source_product_id text not null check (length(source_product_id) between 1 and 100),
  catalog_type text not null check (catalog_type in ('pc','laptop','monitor','mouse','keyboard','headphones','webcam','printer','air_conditioner','coffee_machine','cpu','gpu')),
  source_category_id text not null,
  manufacturer text not null check (length(manufacturer) between 1 and 160),
  model text not null check (length(model) between 1 and 160),
  product_code text,
  component_vendor text,
  family text,
  component_model text check (length(component_model) between 1 and 160),
  is_current boolean not null default true,
  on_market boolean,
  popularity bigint not null default 0 check (popularity >= 0),
  -- Icecat supplies wall-clock timestamps without an unambiguous timezone.
  source_updated_at timestamp not null,
  source_seen_at timestamp not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  search_model text generated always as (lower(coalesce(component_model, model))) stored,
  search_manufacturer text generated always as (lower(coalesce(component_vendor, manufacturer))) stored,
  primary key (source, source_product_id)
);
create index equipment_catalog_context_idx on public.equipment_catalog_products (catalog_type, search_manufacturer, family);
create index equipment_catalog_model_prefix_idx on public.equipment_catalog_products (catalog_type, search_model text_pattern_ops);
create index equipment_catalog_model_trgm_idx on public.equipment_catalog_products using gin (search_model extensions.gin_trgm_ops);

-- Precomputed at sync completion so opening a manufacturer picker never aggregates products.
create table public.equipment_catalog_manufacturers (
  catalog_type text not null,
  name text not null,
  search_name text generated always as (lower(name)) stored,
  popularity numeric not null,
  product_count bigint not null,
  primary key (catalog_type, name)
);
create index equipment_catalog_manufacturer_rank_idx on public.equipment_catalog_manufacturers (catalog_type, popularity desc, product_count desc, name);
create index equipment_catalog_manufacturer_search_idx on public.equipment_catalog_manufacturers using gin (search_name extensions.gin_trgm_ops);

create table public.equipment_catalog_sync_state (
  source text primary key,
  completed_generation timestamp,
  run_id uuid,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text
);
alter table public.equipment_catalog_products enable row level security;
alter table public.equipment_catalog_manufacturers enable row level security;
alter table public.equipment_catalog_sync_state enable row level security;
revoke all on public.equipment_catalog_products, public.equipment_catalog_manufacturers, public.equipment_catalog_sync_state from public, anon, authenticated, service_role;
grant select on public.equipment_catalog_products, public.equipment_catalog_manufacturers to authenticated;
grant select, insert, update on public.equipment_catalog_products, public.equipment_catalog_sync_state to service_role;
grant select, insert, update, delete on public.equipment_catalog_manufacturers to service_role;

create policy equipment_catalog_admin_read on public.equipment_catalog_products for select to authenticated
using ((select count(*) = 1 and bool_and(m.system_role = 'admin') from public.studio_members m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.user_id = (select auth.uid()) and m.is_active));
create policy equipment_catalog_manufacturer_admin_read on public.equipment_catalog_manufacturers for select to authenticated
using ((select count(*) = 1 and bool_and(m.system_role = 'admin') from public.studio_members m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.user_id = (select auth.uid()) and m.is_active));

create function public.search_equipment_catalog(p_type text, p_query text, p_manufacturer text default '', p_family text default '', p_field text default 'model')
returns table (value text)
language plpgsql stable security invoker set search_path = ''
set statement_timeout = '2s'
as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
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
    return query select c.search_value from (
      select coalesce(p.component_model, p.model) search_value,
        min(case when p.search_model = q then 0 when p.search_model like pattern || '%' then 1
          when p.search_model like '%' || pattern || '%' then 2 else 3 end) match_rank,
        bool_or(p.is_current and coalesce(p.on_market, true)) current_rank,
        max(extensions.similarity(p.search_model, q)) similarity_rank,
        max(p.popularity) popularity_rank
      from public.equipment_catalog_products p
      where p.catalog_type = p_type
        and (coalesce(p_manufacturer,'') = '' or p.search_manufacturer = lower(btrim(p_manufacturer)))
        and (coalesce(p_family,'') = '' or p.family = p_family)
        and (p.search_model like pattern || '%' or
          (length(q) >= 3 and (p.search_model like '%' || pattern || '%' or p.search_model operator(extensions.%) q)))
      group by coalesce(p.component_model, p.model)
    ) c order by c.match_rank, c.current_rank desc, c.similarity_rank desc, c.popularity_rank desc, c.search_value limit 12;
  else raise exception 'invalid_catalog_field';
  end if;
end;
$$;
revoke all on function public.search_equipment_catalog(text,text,text,text,text) from public, anon;
grant execute on function public.search_equipment_catalog(text,text,text,text,text) to authenticated, service_role;

-- A renewable lease plus run-id fencing protects retries and overlapping schedulers.
create function public.claim_equipment_catalog_sync(p_source text, p_run_id uuid)
returns setof public.equipment_catalog_sync_state
language sql security invoker set search_path = '' as $$
  insert into public.equipment_catalog_sync_state as s(source, run_id, lease_until, last_started_at, last_error)
  values (p_source, p_run_id, now() + interval '10 minutes', now(), null)
  on conflict (source) do update set run_id = excluded.run_id, lease_until = excluded.lease_until,
    last_started_at = excluded.last_started_at, last_error = null
  where s.run_id is null or s.lease_until < now()
  returning *;
$$;

create function public.import_equipment_catalog_batch(p_source text, p_run_id uuid, p_generation timestamp, p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare r jsonb;
begin
  perform 1 from public.equipment_catalog_sync_state where source = p_source and run_id = p_run_id and lease_until > now() for update;
  if not found then raise exception 'catalog_sync_lease_lost'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'invalid_catalog_batch'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if r->>'is_current' = 'false' then
      update public.equipment_catalog_products set is_current = false, on_market = false,
        source_seen_at = p_generation, source_updated_at = greatest(source_updated_at, (r->>'source_updated_at')::timestamp), last_seen_at = now()
      where source = p_source and source_product_id = r->>'source_product_id' and source_seen_at <= p_generation;
    else
      insert into public.equipment_catalog_products as p (source, source_product_id, catalog_type, source_category_id,
        manufacturer, model, product_code, component_vendor, family, component_model, on_market, popularity, source_updated_at, source_seen_at)
      values (p_source, r->>'source_product_id', r->>'catalog_type', r->>'source_category_id', r->>'manufacturer', r->>'model',
        r->>'product_code', r->>'component_vendor', r->>'family', r->>'component_model', (r->>'on_market')::boolean,
        (r->>'popularity')::bigint, (r->>'source_updated_at')::timestamp, p_generation)
      on conflict (source, source_product_id) do update set
        catalog_type = excluded.catalog_type, source_category_id = excluded.source_category_id, manufacturer = excluded.manufacturer,
        model = excluded.model, product_code = excluded.product_code, component_vendor = excluded.component_vendor,
        family = excluded.family, component_model = excluded.component_model, is_current = true, on_market = excluded.on_market,
        popularity = excluded.popularity, source_updated_at = excluded.source_updated_at, source_seen_at = excluded.source_seen_at, last_seen_at = now()
      where p.source_seen_at <= excluded.source_seen_at and p.source_updated_at <= excluded.source_updated_at;
    end if;
  end loop;
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
      from public.equipment_catalog_products where catalog_type not in ('cpu', 'gpu') group by catalog_type, lower(manufacturer);
  end if;
  update public.equipment_catalog_sync_state set run_id = null, lease_until = null,
    completed_generation = case when p_error is null then greatest(completed_generation, p_generation) else completed_generation end,
    last_completed_at = case when p_error is null then now() else last_completed_at end,
    last_error = left(p_error, 500)
  where source = p_source and run_id = p_run_id;
end;
$$;
revoke all on function public.claim_equipment_catalog_sync(text,uuid), public.import_equipment_catalog_batch(text,uuid,timestamp,jsonb), public.finish_equipment_catalog_sync(text,uuid,timestamp,text) from public, anon, authenticated;
grant execute on function public.claim_equipment_catalog_sync(text,uuid), public.import_equipment_catalog_batch(text,uuid,timestamp,jsonb), public.finish_equipment_catalog_sync(text,uuid,timestamp,text) to service_role;
