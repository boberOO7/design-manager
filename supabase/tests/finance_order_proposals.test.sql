begin;
select no_plan();
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('79600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
insert into public.studios(id,name) values(pg_temp.pid(1),'Order proposals'),(pg_temp.pid(2),'Other studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.pid(n),'authenticated','authenticated','order-proposal-'||n||'@test','{}','{}',now(),now() from generate_series(10,11)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.pid(n),'Order proposal admin','order-proposal-'||n||'@test','admin',true from generate_series(10,11)n;
insert into public.studio_members(studio_id,user_id,system_role)
values(pg_temp.pid(1),pg_temp.pid(10),'admin'),(pg_temp.pid(2),pg_temp.pid(11),'admin');
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.pid(1),'EUR','2026-09-01',pg_temp.pid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.pid(20),pg_temp.pid(1),'Bank','EUR',0,pg_temp.pid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
values(pg_temp.pid(30),pg_temp.pid(1),'336 Interior',100,'2026-09-01',pg_temp.pid(10),'active'),
  (pg_temp.pid(31),pg_temp.pid(1),'337 Other project',100,'2026-09-01',pg_temp.pid(10),'active');
create function pg_temp.presentation(source jsonb) returns jsonb language sql as $$
  select jsonb_build_object('projectTitle',source->>'projectTitle','clientName',source->>'clientName',
    'contact',source->>'contact','address',source->>'address','intro','')
$$;
create function pg_temp.save(source jsonb,request integer,commercial_order uuid) returns uuid
language sql security definer set search_path='' as $$
  select public.save_finance_project_proposal(pg_temp.pid(1),(source->>'projectId')::uuid,pg_temp.pid(request),
    source,pg_temp.presentation(source),'JVBERi0=',pg_temp.pid(10),commercial_order)
$$;
-- A pre-migration document with backfilled ownership: V1 bytes/snapshot remain unchanged.
create function pg_temp.insert_legacy(source jsonb) returns uuid language sql security definer set search_path='' as $$
  insert into public.finance_project_proposals(studio_id,project_id,order_id,revision,request_id,snapshot,pdf,created_by)
    values(pg_temp.pid(1),pg_temp.pid(30),(source->'order'->>'id')::uuid,(source->>'revision')::integer,pg_temp.pid(206),
      (source-'order'-'sourceRevision')||jsonb_build_object('schemaVersion',1,'designVariant','classic'),decode('JVBERi0=','base64'),pg_temp.pid(10)) returning id
$$;
select set_config('request.jwt.claim.sub',pg_temp.pid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.pid(1));
select public.save_finance_project_plan(pg_temp.pid(1),pg_temp.pid(100),pg_temp.pid(30),jsonb_build_object(
  'revision',0,'pricingMethod','area','amount','4000','area','100','rate','40','currency','EUR',
  'vatRate','23','priceBasis','net','revenueTaxRate','6','reason','Interior agreement','known','[]'::jsonb,
  'items',jsonb_build_array(jsonb_build_object('id','','name','Interior advance','amount','2000','percentage','50'),
    jsonb_build_object('id','','name','Interior final','amount','2000','percentage','50'))));
create temporary table facade as select public.save_finance_project_order(pg_temp.pid(1),pg_temp.pid(101),pg_temp.pid(30),jsonb_build_object(
  'intent','create','name','Фасад','plan',jsonb_build_object('revision',0,'pricingMethod','fixed','amount','3500','currency','EUR',
    'discountType','percentage','discountValue','10','vatRate','23','priceBasis','net','revenueTaxRate','6',
    'reason','Facade draft','allowUnscheduled',false,'known','[]'::jsonb,
    'items',jsonb_build_array(jsonb_build_object('id','','draftKey',pg_temp.pid(400),'name','Facade advance','amount','1575','percentage','50','clientNote','Advance note'),
      jsonb_build_object('id','','draftKey',pg_temp.pid(401),'name','Facade final','amount','1575','percentage','50'))))) as id;
create temporary table draft_source as select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30),(select id from facade)) as source;
create temporary table main_source as select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30)) as source;
select is((select source->>'schemaVersion' from draft_source),'2','new proposal snapshots are versioned');
select is((select source->'order'->>'status' from draft_source),'draft','draft proposal states its commercial lifecycle');
select is((select source->'order'->>'name' from draft_source),'Фасад','proposal freezes order identity');
select is((select (source->>'gross')::numeric from draft_source),3874.50::numeric,'draft client total reuses discount and VAT semantics');
select is((select (source->'pricing'->>'discountAmount')::numeric from draft_source),350::numeric,'draft discount is authoritative');
select is((select (source->'rows'->0->>'gross')::numeric from draft_source),1937.25::numeric,'draft schedule uses canonical VAT allocation');
select is((select source->'rows'->0->>'id' from draft_source),pg_temp.pid(400)::text,'draft row identity is stable without a finance item');
select is((select source->'rows'->0->>'note' from draft_source),'Advance note','draft proposal retains client stage notes');
select is((select source->'rows'->0->>'name' from main_source),'Interior advance','default source excludes independent draft schedule');
select is((select count(*) from public.finance_project_terms where project_id=pg_temp.pid(30)),1::bigint,'draft creates no canonical agreement');
select is((select count(*) from public.finance_project_items where project_id=pg_temp.pid(30)),2::bigint,'draft creates no expected payments');
select ok((select not source ? 'revenueTaxRate' and not source ? 'afterTax' from draft_source),'draft client source excludes internal tax');
select lives_ok($$select pg_temp.save(source,200,(select id from facade)) from draft_source$$,'draft order can have a saved proposal');
select lives_ok($$select pg_temp.save(source,200,(select id from facade)) from draft_source$$,'draft proposal retries are idempotent');
select lives_ok($$select pg_temp.save(source,201,null) from main_source$$,'legacy proposal call resolves only the default order');
select is((select count(*) from public.finance_project_proposals where project_id=pg_temp.pid(30) and revision=1),2::bigint,'proposal revision numbering is independent per order');
create temporary table frozen as select id,snapshot,pdf from public.finance_project_proposals where project_id=pg_temp.pid(30);
select throws_like($$select pg_temp.save(source,202,(select id from facade)) from main_source$$,'%finance_input_invalid%','source identity cannot be reassigned to another order');
select throws_like($$select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(31),(select id from facade))$$,'%finance_project_agreement_required%','same-studio order cannot be read through another project');
select public.save_finance_project_order(pg_temp.pid(1),pg_temp.pid(102),pg_temp.pid(30),jsonb_build_object(
  'intent','saveDraft','orderId',(select id from facade),'version',1,
  'plan',(select draft_plan||jsonb_build_object('reason','Updated draft') from public.finance_project_orders where id=(select id from facade))));
select throws_like($$select pg_temp.save(source,203,(select id from facade)) from draft_source$$,'%finance_version_conflict%','saved draft version invalidates stale previews even when price is unchanged');
select public.save_finance_project_order(pg_temp.pid(1),pg_temp.pid(103),pg_temp.pid(30),jsonb_build_object(
  'intent','confirm','orderId',(select id from facade),'version',2));
select is((select source->'order'->>'status' from (select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30),(select id from facade)) source) q),'confirmed','proposal source follows atomic publication');
select is((select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30),(select id from facade))->>'revision'),'2','confirmation preserves draft proposal history');
select is((select count(*) from public.finance_project_terms where project_id=pg_temp.pid(30)),2::bigint,'confirmation publishes only the additional agreement');
select is((select count(*) from public.finance_project_items where project_id=pg_temp.pid(30)),4::bigint,'confirmation publishes only the additional schedule');
select results_eq($$select id,snapshot,pdf from public.finance_project_proposals where project_id=pg_temp.pid(30) order by id$$,$$select id,snapshot,pdf from frozen order by id$$,'draft save and confirmation preserve all saved proposal bytes');
select lives_ok($$select pg_temp.save(s,204,(select id from facade)) from (select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30),(select id from facade)) s) q$$,'confirmed proposal uses canonical order schedule');
select is((select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30))->>'revision'),'2','other order generation does not advance default proposal revisions');
create temporary table discarded as select public.save_finance_project_order(pg_temp.pid(1),pg_temp.pid(104),pg_temp.pid(30),jsonb_build_object(
  'intent','create','name','Ландшафт','plan',(select draft_plan from public.finance_project_orders where id=(select id from facade)))) as id;
create temporary table discarded_source as select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30),(select id from discarded)) as source;
select pg_temp.save(source,205,(select id from discarded)) from discarded_source;
create temporary table discarded_pdf as select snapshot,pdf from public.finance_project_proposals where order_id=(select id from discarded);
select public.save_finance_project_order(pg_temp.pid(1),pg_temp.pid(105),pg_temp.pid(30),jsonb_build_object(
  'intent','discard','orderId',(select id from discarded),'version',1));
select throws_like($$select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30),(select id from discarded))$$,'%finance_project_agreement_required%','discarded order cannot prepare another proposal');
select results_eq($$select snapshot,pdf from public.finance_project_proposals where order_id=(select id from discarded)$$,$$select snapshot,pdf from discarded_pdf$$,'discarded draft retains immutable proposal history and PDF bytes');
select lives_ok($$select pg_temp.save(source,205,(select id from discarded)) from discarded_source$$,'lost-response retry returns its existing proposal even after draft discard');
select is((select count(*) from public.finance_project_items where project_id=pg_temp.pid(30)),4::bigint,'discarded draft never enters the payment schedule');
create temporary table legacy_source as select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30)) as source;
select pg_temp.insert_legacy(source) from legacy_source;
select lives_ok($$select pg_temp.save((source-'order'-'sourceRevision')||jsonb_build_object('schemaVersion',1),206,null) from legacy_source$$,'identical historical V1 SQL retry survives ownership backfill');
select throws_like($$select pg_temp.save((source-'order'-'sourceRevision')||jsonb_build_object('schemaVersion',1),207,null) from legacy_source$$,'%finance_version_conflict%','a V1 source cannot create a new order proposal');
create temporary table old_default as select public.save_finance_project_order(pg_temp.pid(1),pg_temp.pid(106),pg_temp.pid(31),jsonb_build_object(
  'intent','create','name','Default draft','plan',(select draft_plan from public.finance_project_orders where id=(select id from facade)))) as id;
select pg_temp.save(s,208,null) from (select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(31)) s) q;
select public.save_finance_project_order(pg_temp.pid(1),pg_temp.pid(107),pg_temp.pid(31),jsonb_build_object(
  'intent','discard','orderId',(select id from old_default),'version',1));
create temporary table replacement_default as select public.save_finance_project_order(pg_temp.pid(1),pg_temp.pid(108),pg_temp.pid(31),jsonb_build_object(
  'intent','create','name','Replacement default','plan',(select draft_plan from public.finance_project_orders where id=(select id from facade)))) as id;
create temporary table replacement_source as select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(31)) source;
select is((select source->'order'->>'id' from replacement_source),(select id::text from replacement_default),'legacy source chooses the replacement default after discarded default');
select lives_ok($$select pg_temp.save(source,209,null) from replacement_source$$,'legacy save resolves the same active replacement default');
select is((select count(*) from public.finance_project_proposals where order_id=(select id from old_default)),1::bigint,'discarded default retains explicitly scoped proposal history');
select is((select count(*) from public.finance_project_proposals where order_id=(select id from replacement_default)),1::bigint,'replacement default owns its independent first revision');
select ok(not has_function_privilege('authenticated','public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid)','EXECUTE'),'untrusted clients cannot save order PDF bytes');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.pid(11)::text,true);
set local role authenticated;
select throws_like($$select public.get_finance_proposal_source(pg_temp.pid(1),pg_temp.pid(30),(select id from facade))$$,'%finance_forbidden%','other-studio admin cannot prepare proposals');
select is((select count(*) from public.finance_project_proposals),0::bigint,'proposal history remains isolated by studio');
reset role;
select * from finish();
rollback;
