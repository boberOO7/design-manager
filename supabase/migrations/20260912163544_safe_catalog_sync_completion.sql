alter table public.equipment_catalog_manufacturers
  add constraint equipment_catalog_manufacturers_search_key unique (catalog_type, search_name);

create or replace function public.finish_equipment_catalog_sync(p_source text, p_run_id uuid, p_generation timestamp, p_error text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.equipment_catalog_sync_state where source = p_source and run_id = p_run_id and lease_until > now() for update;
  if not found then raise exception 'catalog_sync_lease_lost'; end if;
  if p_error is null then
    if p_generation is null then raise exception 'catalog_generation_required'; end if;
    -- Canonical models are append-only history, so every legitimate manufacturer
    -- remains useful. Refresh its aggregate instead of deleting the whole cache.
    insert into public.equipment_catalog_manufacturers(catalog_type, name, popularity, product_count)
      select catalog_type, min(manufacturer), sum(popularity), count(*)
      from public.equipment_catalog_models where catalog_type not in ('cpu', 'gpu')
      group by catalog_type, search_manufacturer
    on conflict (catalog_type, search_name) do update set
      name = excluded.name,
      popularity = excluded.popularity,
      product_count = excluded.product_count;
  end if;
  update public.equipment_catalog_sync_state set run_id = null, lease_until = null,
    completed_generation = case when p_error is null then greatest(completed_generation, p_generation) else completed_generation end,
    last_completed_at = case when p_error is null then now() else last_completed_at end,
    last_error = left(p_error, 500)
  where source = p_source and run_id = p_run_id;
end;
$$;
