begin;
select plan(69);
insert into public.studios(id,name) values ('62000000-0000-0000-0000-000000000001','Catalog test');
insert into auth.users(id,aud,role,email) values
('62000000-0000-0000-0000-000000000010','authenticated','authenticated','catalog-admin@test'),
('62000000-0000-0000-0000-000000000011','authenticated','authenticated','catalog-employee@test');
insert into public.profiles(id,full_name,email,system_role,is_active) values
('62000000-0000-0000-0000-000000000010','Admin','catalog-admin@test','admin',true),
('62000000-0000-0000-0000-000000000011','Employee','catalog-employee@test','employee',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active) values
('62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000010','admin',true),
('62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000011','employee',true);

set local role service_role;
select is((select count(*)::int from public.claim_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000020')),1,'worker claims a lease');
select is((select count(*)::int from public.claim_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000021')),0,'overlapping worker cannot claim');
select throws_like($$select public.import_equipment_catalog_batch('catalog_test','62000000-0000-0000-0000-000000000021','2026-09-10','[]')$$,'%lease_lost%','wrong run cannot write');
select public.import_equipment_catalog_batch('catalog_test','62000000-0000-0000-0000-000000000020','2026-09-10T02:00:00',
'[{"source_product_id":"1","catalog_type":"monitor","manufacturer":"Catalog Dell","model":"U2700","on_market":true,"popularity":3,"source_updated_at":"2026-09-09T00:00:00"},
{"source_product_id":"2","catalog_type":"monitor","manufacturer":"Catalog Dell","model":"U2701","on_market":false,"popularity":100,"source_updated_at":"2026-09-09T00:00:00"},
{"source_product_id":"3","catalog_type":"monitor","manufacturer":"Catalog Dell","model":"Display U27","on_market":true,"popularity":1000,"source_updated_at":"2026-09-09T00:00:00"},
{"source_product_id":"4","catalog_type":"cpu","manufacturer":"Catalog Test Intel","model":"Catalog Core i7-14700KF Test","component_vendor":"Catalog Test Intel","family":"Catalog Core i7","component_model":"14700KF Test","popularity":4,"source_updated_at":"2026-09-09T00:00:00"},
{"source_product_id":"5","catalog_type":"gpu","manufacturer":"Catalog Test ASUS","model":"Catalog GeForce RTX 4070 Ti Test","component_vendor":"Catalog Test NVIDIA","family":"Catalog GeForce RTX","component_model":"4070 Ti Test","popularity":4,"source_updated_at":"2026-09-09T00:00:00"},
{"source_product_id":"6","catalog_type":"monitor","manufacturer":" catalog   dell ","model":" U2700 ","on_market":true,"popularity":5,"source_updated_at":"2026-09-09T00:00:00"},
{"source_product_id":"7","catalog_type":"monitor","manufacturer":"Catalog Dell","model":"U2700-A","on_market":true,"popularity":1,"source_updated_at":"2026-09-09T00:00:00"},
{"source_product_id":"8","catalog_type":"monitor","manufacturer":"Catalog Dell","model":"Old Identity","on_market":true,"popularity":1,"source_updated_at":"2026-09-09T00:00:00"}]');
select public.finish_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000020','2026-09-10T02:00:00');
select is((select count(distinct catalog_model_id)::int from public.equipment_catalog_provider_products where source='catalog_test'),7,'duplicate provider SKUs collapse to canonical models');
select is((select count(*)::int from public.equipment_catalog_provider_products where source='catalog_test'),8,'every provider product retains a lightweight mapping');
select is((select provider_product_count::int from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='u2700'),2,'canonical aggregate counts duplicate provider products');
select is((select manufacturer from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='u2700'),'Catalog Dell','canonical display keeps normalized first-seen text');
select is((select count(*)::int from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model in ('u2700','u2700-a')),2,'meaningful model suffixes remain distinct');
select is((select completed_generation::text from public.equipment_catalog_sync_state where source='catalog_test'),'2026-09-10 02:00:00','completion records watermark');
select throws_like($$delete from public.equipment_catalog_provider_products where source='catalog_test'$$,'%permission denied%','worker cannot delete provider history');
select throws_like($$delete from public.equipment_catalog_models$$,'%permission denied%','worker cannot delete canonical history');
insert into public.equipment_catalog_manufacturers(catalog_type,name,popularity,product_count)
  select 'coffee_machine', 'Catalog Test Maker ' || n, 100-n, 1 from generate_series(1,12) n;

select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select is((select count(*)::int from public.search_equipment_catalog('coffee_machine','','','','manufacturer')),10,'common manufacturer list is bounded at ten');
select results_eq($$select value from public.search_equipment_catalog('coffee_machine','Maker 12','','','manufacturer')$$,$$values ('Catalog Test Maker 12')$$,'typing finds manufacturers outside the common ten');
select results_eq($$select value from public.search_equipment_catalog('monitor','U270','Catalog Dell') limit 1$$,$$values ('U2700')$$,'prefix search remains deterministic');
select results_eq($$select value from public.search_equipment_catalog('monitor','Dispay U27','Catalog Dell') limit 1$$,$$values ('Display U27')$$,'trigram fallback finds a misspelled model');
select is((select count(*)::int from public.search_equipment_catalog('monitor','U2700','Catalog Dell') where value='U2700'),1,'autocomplete never returns SKU-level duplicates');
select results_eq($$select value from public.search_equipment_catalog('monitor','U2701','catalog dell') limit 1$$,$$values ('U2701')$$,'off-market exact matches remain searchable');
select results_eq($$select value from public.search_equipment_catalog('cpu','147','Catalog Test Intel','Catalog Core i7')$$,$$values ('14700KF Test')$$,'CPU search uses component identity');
select results_eq($$select value from public.search_equipment_catalog('gpu','407','Catalog Test NVIDIA','Catalog GeForce RTX')$$,$$values ('4070 Ti Test')$$,'GPU search uses component vendor identity');
select is((select count(*)::int from public.search_equipment_catalog('cpu','147','Catalog Test Intel','Catalog Core i5')),0,'family filter excludes other families');
select is((select count(*)::int from public.search_equipment_catalog('monitor','U','Catalog Dell')),0,'model threshold is enforced in database');
select is((select count(*)::int from public.search_equipment_catalog('monitor','%%','Catalog Dell')),0,'query wildcard characters are literal');
select results_eq($$select value from public.search_equipment_catalog('monitor','Catalog Dell','','','manufacturer')$$,$$values ('Catalog Dell')$$,'manufacturer search uses canonical catalog');
select lives_ok($$insert into public.equipment(studio_id,equipment_type,manufacturer,model) values ('62000000-0000-0000-0000-000000000001','monitor','Unlisted builder','Hand made 1985')$$,'manual inventory values require no catalog relationship');
select throws_like($$insert into public.equipment_catalog_models(catalog_type,manufacturer,model,source_updated_at) values ('monitor','Bad','Bad','2026-01-01')$$,'%permission denied%','admins cannot import canonical references');
select throws_like($$update public.equipment_catalog_models set model='bad'$$,'%permission denied%','admins cannot change canonical references');
select throws_like($$delete from public.equipment_catalog_models$$,'%permission denied%','admins cannot delete canonical references');
select is((select count(*)::int from public.equipment_catalog_provider_products where source='catalog_test'),8,'admins can read provider mappings');
select throws_like($$select * from public.equipment_catalog_sync_state$$,'%permission denied%','admins cannot inspect worker state');
select throws_like($$select public.claim_equipment_catalog_sync('bad',gen_random_uuid())$$,'%permission denied%','admins cannot claim sync');
select throws_like($$select public.import_equipment_catalog_batch('bad',gen_random_uuid(),now()::timestamp,'[]')$$,'%permission denied%','admins cannot invoke importer');

select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000011',true);
select is((select count(*)::int from public.equipment_catalog_models),0,'employees cannot read canonical references');
select is((select count(*)::int from public.search_equipment_catalog('monitor','U27','Catalog Dell')),0,'search respects employee RLS');
select is((select count(*)::int from public.search_equipment_catalog('monitor','','','','manufacturer')),0,'manufacturer search respects employee RLS');
select is((select count(*)::int from public.equipment_catalog_provider_products),0,'provider mapping RLS hides rows from employees');
set local role anon;
select throws_like($$select * from public.equipment_catalog_models$$,'%permission denied%','anon cannot read canonical references');
select throws_like($$select * from public.search_equipment_catalog('monitor','U27')$$,'%permission denied%','anon cannot search');

set local role service_role;
select * from public.claim_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000022');
select public.import_equipment_catalog_batch('catalog_test','62000000-0000-0000-0000-000000000022','2026-09-11T02:00:00','[{"source_product_id":"1","is_current":false,"source_updated_at":"2026-09-11T01:00:00"}]');
select public.finish_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000022','2026-09-11T02:00:00');
select is((select is_current from public.equipment_catalog_provider_products where source='catalog_test' and source_product_id='1'),false,'REMOVED marks its provider mapping historical');
select is((select is_current from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='u2700'),true,'canonical stays current while another provider product survives');
select is((select provider_product_count::int from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='u2700'),2,'REMOVED mappings remain part of historical provider count');
select is((select count(*)::int from public.equipment_catalog_provider_products where source='catalog_test'),8,'rows absent from later feeds are retained');

select * from public.claim_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000023');
select public.import_equipment_catalog_batch('catalog_test','62000000-0000-0000-0000-000000000023','2026-09-12T02:00:00','[{"source_product_id":"6","is_current":false,"source_updated_at":"2026-09-12T01:00:00"}]');
select public.finish_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000023','2026-09-12T02:00:00');
select is((select is_current from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='u2700'),false,'canonical becomes historical when all mappings are removed');
select is((select count(*)::int from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='u2700'),1,'historical canonical model is never deleted');
select results_eq($$select model from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='u2700'$$,$$values ('U2700')$$,'removed canonical display remains available');

select * from public.claim_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000024');
select public.import_equipment_catalog_batch('catalog_test','62000000-0000-0000-0000-000000000024','2026-09-13T02:00:00','[{"source_product_id":"8","catalog_type":"monitor","manufacturer":"Catalog Dell","model":"New Identity","on_market":true,"popularity":7,"source_updated_at":"2026-09-13T01:00:00"}]');
select public.finish_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000024','2026-09-13T02:00:00');
select is((select is_current from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='old identity'),false,'old canonical aggregate becomes historical after identity move');
select is((select provider_product_count::int from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='old identity'),0,'old canonical aggregate loses the moved mapping');
select is((select is_current from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='new identity'),true,'new canonical aggregate becomes current after identity move');
select results_eq($$select m.search_model from public.equipment_catalog_provider_products p join public.equipment_catalog_models m on m.id=p.catalog_model_id where p.source='catalog_test' and p.source_product_id='8'$$,$$values ('new identity')$$,'provider mapping resolves to its new canonical identity');
select is((select count(*)::int from public.search_equipment_catalog('monitor','Old Identity','Catalog Dell') where value='Old Identity'),0,'superseded zero-mapping identities do not remain autocomplete duplicates');

select * from public.claim_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000025');
select public.import_equipment_catalog_batch('catalog_test','62000000-0000-0000-0000-000000000025','2026-09-13T02:00:00','[{"source_product_id":"8","catalog_type":"monitor","manufacturer":"Catalog Dell","model":"New Identity","on_market":true,"popularity":7,"source_updated_at":"2026-09-13T01:00:00"}]');
select is((select count(*)::int from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='new identity'),1,'idempotent replay creates no canonical duplicate');
select is((select count(*)::int from public.equipment_catalog_provider_products where source='catalog_test'),8,'idempotent replay creates no mapping duplicate');
select public.finish_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000025','2026-09-13T02:00:00');

select * from public.claim_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000026');
select public.import_equipment_catalog_batch('catalog_test','62000000-0000-0000-0000-000000000026','2026-09-10T02:00:00','[{"source_product_id":"6","catalog_type":"monitor","manufacturer":"Catalog Dell","model":"U2700","on_market":true,"popularity":999,"source_updated_at":"2026-09-10T01:00:00"}]');
select is((select is_current from public.equipment_catalog_provider_products where source='catalog_test' and source_product_id='6'),false,'stale update cannot resurrect provider product');
select is((select is_current from public.equipment_catalog_models where search_manufacturer='catalog dell' and search_model='u2700'),false,'stale update cannot alter canonical aggregate');
select public.finish_equipment_catalog_sync('catalog_test','62000000-0000-0000-0000-000000000026','2026-09-14','Simulated interruption');
select is((select completed_generation::text from public.equipment_catalog_sync_state where source='catalog_test'),'2026-09-13 02:00:00','failed sync leaves completed checkpoint unchanged');
select is((select last_error from public.equipment_catalog_sync_state where source='catalog_test'),'Simulated interruption','failure is observable');

select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select results_eq($$select value from public.search_equipment_catalog('monitor','U270','Catalog Dell') limit 1$$,$$values ('U2700-A')$$,'current on-market model ranks above historical prefix matches');
select results_eq($$select value from public.search_equipment_catalog('monitor','U2700','Catalog Dell') limit 1$$,$$values ('U2700')$$,'historical exact model remains searchable');
select is((select model from public.equipment where manufacturer='Unlisted builder'),'Hand made 1985','sync never changes inventory');

set local role postgres;
update public.profiles set is_active=false where id='62000000-0000-0000-0000-000000000010';
set local role authenticated;
select is((select count(*)::int from public.equipment_catalog_models),0,'inactive profile cannot read shared references');
set local role postgres;
select is((select count(*)::int from pg_constraint where contype='f' and conrelid='public.equipment_catalog_models'::regclass),0,'canonical models have no inventory or tenant foreign keys');
select is((select count(*)::int from pg_constraint where contype='f' and conrelid='public.equipment_catalog_provider_products'::regclass),1,'provider mapping has only its canonical model foreign key');
select ok(exists(select 1 from pg_indexes where tablename='equipment_catalog_models' and indexdef like '%gin%'),'trigram index supports canonical search');
select ok(not exists(select 1 from pg_indexes where tablename='equipment_catalog_provider_products' and indexdef like '%gin%'),'provider mapping has no fuzzy index');
select ok(exists(select 1 from pg_indexes where tablename='equipment_catalog_models' and indexdef like '%text_pattern_ops%'),'prefix index supports canonical search');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='equipment_catalog_provider_products' and column_name in ('manufacturer','model','search_model','search_manufacturer')),'provider mappings do not duplicate autocomplete text');
select ok((select relrowsecurity from pg_catalog.pg_class where oid='public.equipment_catalog_models'::regclass),'canonical table has RLS');
select ok((select relrowsecurity from pg_catalog.pg_class where oid='public.equipment_catalog_provider_products'::regclass),'provider mapping table has RLS');
select ok(position('delete from public.equipment_catalog_manufacturers' in pg_get_functiondef('public.finish_equipment_catalog_sync(text,uuid,timestamp,text)'::regprocedure))=0,'completion does not clear manufacturer history');
select ok(position('on conflict (catalog_type, search_name) do update' in pg_get_functiondef('public.finish_equipment_catalog_sync(text,uuid,timestamp,text)'::regprocedure))>0,'completion refreshes normalized manufacturer aggregates by upsert');
select * from finish();
rollback;
