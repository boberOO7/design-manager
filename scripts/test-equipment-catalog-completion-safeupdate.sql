-- Run through the local authenticator connection so its session_preload_libraries
-- setting loads safeupdate, matching PostgREST/service-role RPC execution.
begin;
set local role service_role;
do $$
begin
  begin
    execute 'delete from public.equipment_catalog_manufacturers';
    raise exception 'safeupdate protection is not active';
  exception when cardinality_violation then
    if sqlerrm <> 'DELETE requires a WHERE clause' then raise; end if;
  end;
end;
$$;
insert into public.equipment_catalog_models
  (catalog_type, manufacturer, model, popularity, provider_product_count, source_updated_at)
values ('monitor', 'Safeupdate Test Maker', 'Completion Model', 7, 1, '2026-09-12');
do $$
begin
  if (select count(*) from public.claim_equipment_catalog_sync('catalog_safeupdate_test','63000000-0000-0000-0000-000000000001')) <> 1 then
    raise exception 'completion test could not claim its fenced run';
  end if;
  perform public.finish_equipment_catalog_sync('catalog_safeupdate_test','63000000-0000-0000-0000-000000000001','2026-09-12T06:20:01');
  if (select completed_generation from public.equipment_catalog_sync_state where source='catalog_safeupdate_test') is distinct from '2026-09-12T06:20:01'::timestamp then
    raise exception 'completion did not advance its checkpoint';
  end if;
  if not exists (
    select 1 from public.equipment_catalog_manufacturers
    where catalog_type='monitor' and search_name='safeupdate test maker' and name='Safeupdate Test Maker'
      and popularity=7 and product_count=1
  ) then
    raise exception 'completion did not upsert the manufacturer aggregate';
  end if;
  if (select count(*) from public.claim_equipment_catalog_sync('catalog_safeupdate_test','63000000-0000-0000-0000-000000000002')) <> 1 then
    raise exception 'completion replay could not claim its fenced run';
  end if;
  perform public.finish_equipment_catalog_sync('catalog_safeupdate_test','63000000-0000-0000-0000-000000000002','2026-09-12T06:20:02');
  if (select count(*) from public.equipment_catalog_manufacturers where catalog_type='monitor' and search_name='safeupdate test maker') <> 1 then
    raise exception 'completion replay duplicated the manufacturer aggregate';
  end if;
  if (select completed_generation from public.equipment_catalog_sync_state where source='catalog_safeupdate_test') is distinct from '2026-09-12T06:20:02'::timestamp then
    raise exception 'completion replay did not advance its checkpoint';
  end if;
end;
$$;
select 'ok - safeupdate rejects unqualified DELETE and catalog completion succeeds';
rollback;
