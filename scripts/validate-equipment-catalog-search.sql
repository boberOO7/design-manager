-- Explicit scale check; kept outside supabase/tests so routine database tests stay fast.
begin;
select plan(4);
set local role service_role;
insert into public.equipment_catalog_models
  (catalog_type, manufacturer, model, is_current, on_market, popularity, provider_product_count, source_updated_at)
select 'monitor', 'Synthetic Maker', 'Catalog Model ' || lpad(n::text, 6, '0'),
  n % 5 <> 0, n % 5 <> 0, n, 1, '2026-09-12'::timestamp
from generate_series(1, 387626) n;
reset role;
analyze public.equipment_catalog_models;
set local role service_role;
select is((select count(*)::int from public.equipment_catalog_models),387626,'canonical-sized catalog is loaded');
select results_eq(
  $$select value from public.search_equipment_catalog('monitor','Catalog Model 387626','Synthetic Maker') limit 1$$,
  $$values ('Catalog Model 387626')$$,
  'exact canonical search completes within the function timeout'
);
select results_eq(
  $$select value from public.search_equipment_catalog('monitor','Catalog Model 38762','Synthetic Maker') limit 1$$,
  $$values ('Catalog Model 387626')$$,
  'current prefix result ranks above historical models'
);
select results_eq(
  $$select value from public.search_equipment_catalog('monitor','Catalog Modle 387626','Synthetic Maker') limit 1$$,
  $$values ('Catalog Model 387626')$$,
  'fuzzy canonical search completes within the function timeout'
);
select * from finish();
rollback;
