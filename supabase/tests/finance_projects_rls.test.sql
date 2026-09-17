begin;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql immutable as $$select ('65000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Project Finance A'),(pg_temp.fid(2),'Project Finance B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.fid(n),'authenticated','authenticated','planning-'||n||'@test','{}','{}',now(),now() from generate_series(10,14)n;
insert into public.profiles(id,full_name,email,system_role,is_active)
select pg_temp.fid(n),'Planning tester','planning-'||n||'@test',case when n=11 then 'employee' else 'admin' end,n<>13 from generate_series(10,14)n;
insert into public.studio_members(studio_id,user_id,system_role,is_active)
select pg_temp.fid(case when n=12 then 2 else 1 end),pg_temp.fid(n),case when n=11 then 'employee' else 'admin' end,n<>14 from generate_series(10,14)n;
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'UAH','2026-09-01',pg_temp.fid(10)),(pg_temp.fid(2),'UAH','2026-09-01',pg_temp.fid(12));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values
(pg_temp.fid(20),pg_temp.fid(1),'Bank','UAH',1000,pg_temp.fid(10)),(pg_temp.fid(21),pg_temp.fid(1),'Dollar','USD',0,pg_temp.fid(10));
create function pg_temp.cat(key text,studio integer default 1) returns uuid language sql as $$select id from public.finance_categories where studio_id=pg_temp.fid(studio) and default_key=key$$;
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status) values
(pg_temp.fid(30),pg_temp.fid(1),'Project A',100,'2026-09-01',pg_temp.fid(10),'active'),
(pg_temp.fid(31),pg_temp.fid(2),'Project B',100,'2026-09-01',pg_temp.fid(12),'active');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values(pg_temp.fid(30),pg_temp.fid(11),'designer',0,'2026-09-01');
insert into public.contractor_categories(id,studio_id,name,color_key) values(pg_temp.fid(40),pg_temp.fid(1),'Builders','blue'),(pg_temp.fid(41),pg_temp.fid(2),'Builders','blue');
insert into public.contractors(id,category_id,name,created_by) values(pg_temp.fid(42),pg_temp.fid(40),'Builder A',pg_temp.fid(10)),(pg_temp.fid(43),pg_temp.fid(41),'Builder B',pg_temp.fid(12));
create function pg_temp.result(n integer) returns uuid language sql as $$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.terms(n integer,patch jsonb default '{}',project integer default 30) returns uuid language sql as $$
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(project),jsonb_build_object('stream','design','revision',0,'mode','design','amount','500','currency','UAH','reason','Agreement')||patch)$$;
create function pg_temp.item(n integer,patch jsonb default '{}',context jsonb default '{}',project integer default 30) returns uuid language sql as $$
select public.save_finance_project_item(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(project),jsonb_build_object('stream','design','item',jsonb_build_object('direction','incoming','amount','100','currency','UAH','categoryId',pg_temp.cat('project_payments'),
  'description','Advance','dueDate','2026-09-01','expectedDate','2026-10-01','commitment','agreed','certainty','fixed','established',true)||patch)||context)$$;
create function pg_temp.months(n integer,first_month date default '2026-09-01',last_month date default '2026-11-01') returns uuid language sql as $$select public.generate_finance_supervision_months(pg_temp.fid(1),pg_temp.fid(n),pg_temp.fid(30),first_month,last_month)$$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select throws_like($$select pg_temp.item(100)$$,'%finance_project_agreement_required%','design needs an explicit agreement');
select lives_ok($$select pg_temp.terms(90)$$,'create design agreement');
select lives_ok($$select pg_temp.terms(90)$$,'agreement retry is idempotent');
select throws_like($$select pg_temp.terms(90,'{"amount":"600"}')$$,'%finance_request_conflict%','changed retry rejected');
select throws_like($$select pg_temp.terms(91,'{}',31)$$,'%finance_project_invalid%','foreign project denied');
select lives_ok($$select pg_temp.item(100)$$,'first flexible scheduled payment');
select lives_ok($$select pg_temp.item(100)$$,'item creation retry returns same ID');
select is((select count(*) from public.finance_expected_items),1::bigint,'no duplicate expected rows');
select is((select unscheduled_amount from public.finance_project_totals where stream='design'),400::numeric,'below-contract schedule shows unassigned remainder');
select lives_ok($$select pg_temp.item(101,'{"amount":"200","established":false}')$$,'agreed future payment');
select lives_ok($$select pg_temp.item(102,'{"amount":"200","established":false,"commitment":"tentative"}')$$,'third arbitrary installment');
select is((select scheduled_amount from public.finance_project_totals where stream='design'),500::numeric,'schedule reconciles at contract value');
select is((select unscheduled_amount from public.finance_project_totals where stream='design'),0::numeric,'no invented remainder payment');
select is((select outstanding_amount from public.finance_project_totals where stream='design'),100::numeric,'only established amount collectible');
select is((select planned_amount from public.finance_project_totals where stream='design'),400::numeric,'non-established fixed/tentative schedule remains planned');
select throws_like($$select pg_temp.item(103)$$,'%finance_project_over_scheduled%','schedule cannot exceed agreement');
select throws_like($$select pg_temp.item(103,'{"currency":"USD"}')$$,'%finance_project_currency_locked%','design currency is agreement currency');
select throws_like($$select pg_temp.terms(91,'{"revision":1,"amount":"499"}')$$,'%finance_project_over_scheduled%','amendment cannot shrink below active schedule');
select throws_like($$select pg_temp.terms(91,'{"revision":1,"currency":"USD"}')$$,'%finance_project_currency_locked%','agreement currency fixed after schedule');
select lives_ok($$select pg_temp.terms(91,'{"revision":1,"amount":"700","reason":"Additional scope"}')$$,'append amended agreement');
select is((select count(*) from public.finance_project_terms where stream='design'),2::bigint,'old terms retained');
select is((select scheduled_amount from public.finance_project_totals where stream='design'),500::numeric,'amendment does not rewrite schedule');
select is((select unscheduled_amount from public.finance_project_totals where stream='design'),200::numeric,'new value explicitly unscheduled');
select throws_like($$select pg_temp.terms(92,'{"revision":1}')$$,'%finance_version_conflict%','stale agreement rejected');
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(200),jsonb_build_object('kind','incoming','date','2026-09-02','amount','150','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments')));
create function pg_temp.payment() returns uuid language sql as $$select id from public.finance_movements where request_id=pg_temp.fid(200)$$;
select lives_ok($$select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(201),pg_temp.result(100),pg_temp.payment(),40)$$,'match existing ledger partial payment');
select is((select collected_amount from public.finance_project_totals where stream='design'),40::numeric,'collected derives allocations');
select is((select outstanding_amount from public.finance_project_totals where stream='design'),60::numeric,'partial receivable reconciles');
select is((select count(*) from public.finance_movements),1::bigint,'matching creates no additional money');
select throws_like($$select pg_temp.item(110,jsonb_build_object('id',pg_temp.result(100),'version',1,'amount','110'))$$,'%finance_project_settled_terms_locked%','partial settlement locks commercial amount');
select throws_like($$select pg_temp.item(110,jsonb_build_object('id',pg_temp.result(100),'version',1,'dueDate','2026-12-01'))$$,'%finance_project_settled_terms_locked%','due date history retained');
select lives_ok($$select pg_temp.item(110,jsonb_build_object('id',pg_temp.result(100),'version',1,'expectedDate','2027-01-01'))$$,'forecast date editable after settlement');
select is((select due_state from public.finance_expected_balances where id=pg_temp.result(100)),'overdue','forecast delay does not erase overdue');
select lives_ok($$select pg_temp.item(111,jsonb_build_object('id',pg_temp.result(101),'version',1,'amount','150','established',false))$$,'unpaid terms explicitly revised');
select is((select unscheduled_amount from public.finance_project_totals where stream='design'),250::numeric,'unpaid amendment reconciles');
select lives_ok($$select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(202),pg_temp.result(100),pg_temp.payment(),60)$$,'full settlement uses same RPC');
select is((select payment_state from public.finance_expected_balances where id=pg_temp.result(100)),'settled','fully settled state derived');

select lives_ok($$select pg_temp.terms(300,'{"stream":"supervision","mode":"monthly","amount":"50","effectiveFrom":"2026-09-01"}')$$,'open-ended monthly rate');
select lives_ok($$select pg_temp.months(301)$$,'explicit monthly batch');
select lives_ok($$select pg_temp.months(302)$$,'repeat batch with new request skips stable months');
select is((select count(*) from public.finance_project_items where source='monthly'),3::bigint,'exactly one charge per month');
select is((select scheduled_amount from public.finance_project_totals where stream='supervision'),150::numeric,'monthly occurrences use rate');
select is((select contract_amount from public.finance_project_totals where stream='supervision'),null::numeric,'ongoing retainer has no lifetime contract');
select is((select outstanding_amount from public.finance_project_totals where stream='supervision'),0::numeric,'generated monthly amounts not automatically receivable');
select throws_like($$select pg_temp.months(303,'2026-09-01','2027-09-01')$$,'%finance_supervision_range_invalid%','bounded 12-month generation');
select throws_like($$select pg_temp.terms(304,'{"stream":"supervision","revision":1,"mode":"monthly","amount":"70","effectiveFrom":"2026-10-01"}')$$,'%finance_supervision_generated_period%','rate amendment cannot silently rewrite generated period');
select lives_ok($$select pg_temp.terms(304,'{"stream":"supervision","revision":1,"mode":"monthly","amount":"70","effectiveFrom":"2026-12-01","effectiveThrough":"2026-12-31"}')$$,'future monthly amendment');
select lives_ok($$select pg_temp.months(305,'2026-12-01','2026-12-01')$$,'new rate used only for new occurrence');
select is((select scheduled_amount from public.finance_project_totals where stream='supervision'),220::numeric,'previous rate history unchanged');
select throws_like($$select pg_temp.months(306,'2027-01-01','2027-01-01')$$,'%finance_supervision_range_invalid%','effective end respected');
select lives_ok($$select pg_temp.terms(307,'{"stream":"supervision","revision":2,"mode":"per_visit","amount":"25","effectiveFrom":"2027-01-01"}')$$,'per-visit terms separate');
select public.create_calendar_event_with_invites(pg_temp.fid(1),'January visit','site_visit','2027-01-10T10:00Z','2027-01-10T11:00Z',false,pg_temp.fid(30),p_assignee_id=>pg_temp.fid(11));
select public.create_calendar_event_with_invites(pg_temp.fid(1),'Retainer visit','site_visit','2026-10-10T10:00Z','2026-10-10T11:00Z',false,pg_temp.fid(30),p_assignee_id=>pg_temp.fid(11));
select is((select count(*) from public.finance_project_items where source='visit'),0::bigint,'calendar does not auto-bill');
select lives_ok($$select pg_temp.item(310,'{"amount":"25","established":false}',jsonb_build_object('stream','supervision','source','visit','visitId',(select id from public.calendar_events where title='January visit')))$$,'explicit per-visit charge');
select throws_like($$select pg_temp.item(311,'{"amount":"25","established":false}',jsonb_build_object('stream','supervision','source','visit','visitId',(select id from public.calendar_events where title='January visit')))$$,'%finance_project_visit_once%','new request cannot duplicate visit bill');
select throws_like($$select pg_temp.item(312,'{"amount":"25","established":false}',jsonb_build_object('stream','supervision','source','visit','visitId',(select id from public.calendar_events where title='Retainer visit')))$$,'%finance_project_visit_not_billable%','retainer visit not billed without extra confirmation');
select lives_ok($$select pg_temp.item(312,'{"amount":"25","established":false}',jsonb_build_object('stream','supervision','source','visit','extraVisit',true,'visitId',(select id from public.calendar_events where title='Retainer visit')))$$,'explicit additional retainer visit');
select lives_ok($$select pg_temp.terms(313,'{"stream":"supervision","revision":3,"mode":"custom","amount":"","effectiveFrom":"2027-02-01"}')$$,'custom supervision arrangement');
select lives_ok($$select pg_temp.item(314,'{"amount":"30","established":false}', '{"stream":"supervision"}')$$,'custom manual supervision expected item');
select lives_ok($$select pg_temp.item(400,jsonb_build_object('categoryId',pg_temp.cat('contractor_bonus'),'commitment','tentative','established',false),jsonb_build_object('stream','contractor_bonus','contractorId',pg_temp.fid(42)))$$,'bonus linked to existing same-studio contractor');
select is((select contractor_id from public.finance_project_items where expected_item_id=pg_temp.result(400)),pg_temp.fid(42),'contractor identity retained');
select is((select outstanding_amount from public.finance_project_totals where stream='contractor_bonus'),0::numeric,'tentative bonus not receivable');
select throws_like($$select pg_temp.item(401,'{}',jsonb_build_object('stream','contractor_bonus','contractorId',pg_temp.fid(43)))$$,'%finance_project_contractor_invalid%','foreign contractor rejected');
select throws_like($$select pg_temp.item(402,'{}','{}',31)$$,'%finance_project_invalid%','foreign project expected rejected');
select throws_like($$select pg_temp.item(403,'{"direction":"outgoing"}','{"stream":"contractor_bonus"}')$$,'%finance_project_income_required%','contractor bonus is never outgoing');
select throws_like($$delete from public.contractors where id=pg_temp.fid(42)$$,'%foreign key constraint%','contractor history blocks destructive deletion');
select lives_ok($$update public.projects set status='completed',completed_at='2026-09-10' where id=pg_temp.fid(30)$$,'operational completion allowed with unpaid Finance');
select lives_ok($$update public.projects set status='archived',archived_at='2026-09-11' where id=pg_temp.fid(30)$$,'archive with unpaid Finance');
select is((select count(*) from public.finance_project_items where project_id=pg_temp.fid(30)),11::bigint,'archive retains every financial link');
select lives_ok($$select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(203),pg_temp.result(101),pg_temp.payment(),50)$$,'archived project remains collectible');
select lives_ok($$select pg_temp.item(404,'{"amount":"10"}','{"stream":"other"}')$$,'archived project Finance writable');
select throws_like($$update public.finance_project_terms set amount=1$$,'%permission denied%','terms direct mutation denied');
select throws_like($$delete from public.finance_project_items$$,'%permission denied%','link deletion denied');
select throws_like($$select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(405),jsonb_build_object('id',pg_temp.result(100),'version',2,'amount','101','currency','UAH','categoryId',pg_temp.cat('project_payments'),'direction','incoming','commitment','agreed','certainty','fixed','established',true,'dueDate','2026-09-01'))$$,'%finance_project_settled_terms_locked%','global RPC cannot bypass settled term guard');

set local role postgres;
create function pg_temp.denied(actor integer) returns setof text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',pg_temp.fid(actor)::text,true);
  return next is((select count(*) from public.finance_project_terms),0::bigint,'terms hidden for '||actor);
  return next is((select count(*) from public.finance_project_items),0::bigint,'links hidden for '||actor);
  return next is((select count(*) from public.finance_project_totals),0::bigint,'summary hidden for '||actor);
  return next is((select count(*) from public.finance_project_expected_balances),0::bigint,'project balances hidden for '||actor);
  return next throws_like('select pg_temp.terms(900)','%finance_admin_required%','terms mutation denied for '||actor);
  return next throws_like('select pg_temp.item(900)','%finance_admin_required%','project item denied for '||actor);
  return next throws_like('select pg_temp.months(900)','%finance_admin_required%','generation denied for '||actor);
end;
$$;
set local role authenticated;
select pg_temp.denied(11);select pg_temp.denied(12);select pg_temp.denied(13);select pg_temp.denied(14);
reset role;
select * from finish();
rollback;
