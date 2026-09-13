create or replace function public.import_equipment_catalog_batch(p_source text, p_run_id uuid, p_generation timestamp, p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  existing_provider public.equipment_catalog_provider_products%rowtype;
  old_model_id bigint;
  new_model_id bigint;
  affected_model_ids bigint[] := array[]::bigint[];
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
