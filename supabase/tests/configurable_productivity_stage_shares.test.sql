begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.studios(id,name) values
  ('8c000000-0000-0000-0000-000000000001','Configurable productivity'),
  ('8c000000-0000-0000-0000-000000000002','Other studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('8c000000-0000-0000-0000-000000000010','authenticated','authenticated','8c000000-0000-0000-0000-000000000010@shares.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values('8c000000-0000-0000-0000-000000000010','Shares admin','8c000000-0000-0000-0000-000000000010@shares.test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values('8c000000-0000-0000-0000-000000000001','8c000000-0000-0000-0000-000000000010','admin');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('8c000000-0000-0000-0000-000000000011','authenticated','authenticated','8c000000-0000-0000-0000-000000000011@shares.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values('8c000000-0000-0000-0000-000000000011','Shares employee','8c000000-0000-0000-0000-000000000011@shares.test','employee');
insert into public.studio_members(studio_id,user_id,system_role) values('8c000000-0000-0000-0000-000000000001','8c000000-0000-0000-0000-000000000011','employee');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('8c000000-0000-0000-0000-000000000012','authenticated','authenticated','8c000000-0000-0000-0000-000000000012@shares.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values('8c000000-0000-0000-0000-000000000012','Shares admin','8c000000-0000-0000-0000-000000000012@shares.test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values('8c000000-0000-0000-0000-000000000002','8c000000-0000-0000-0000-000000000012','admin');
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values('8c000000-0000-0000-0000-000000000020','8c000000-0000-0000-0000-000000000001','Shares project 20',100,'active',current_date,'8c000000-0000-0000-0000-000000000010');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values('8c000000-0000-0000-0000-000000000020','8c000000-0000-0000-0000-000000000010','designer',0,current_date);
insert into public.tasks(project_id,stage,title,status,created_by) values('8c000000-0000-0000-0000-000000000020','stage_2','Keep project active','todo','8c000000-0000-0000-0000-000000000010');
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values('8c000000-0000-0000-0000-000000000021','8c000000-0000-0000-0000-000000000001','Shares project 21',200,'active',current_date,'8c000000-0000-0000-0000-000000000010');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values('8c000000-0000-0000-0000-000000000021','8c000000-0000-0000-0000-000000000010','designer',0,current_date);
insert into public.tasks(project_id,stage,title,status,created_by) values('8c000000-0000-0000-0000-000000000021','stage_2','Keep project active','todo','8c000000-0000-0000-0000-000000000010');
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values('8c000000-0000-0000-0000-000000000022','8c000000-0000-0000-0000-000000000002','Shares project 22',100,'active',current_date,'8c000000-0000-0000-0000-000000000012');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values('8c000000-0000-0000-0000-000000000022','8c000000-0000-0000-0000-000000000012','designer',0,current_date);
insert into public.tasks(project_id,stage,title,status,created_by) values('8c000000-0000-0000-0000-000000000022','stage_2','Keep project active','todo','8c000000-0000-0000-0000-000000000012');
insert into public.tasks(id,project_id,stage,title,status,assignee_id,completed_area_m2,created_by) values('8c000000-0000-0000-0000-000000000030','8c000000-0000-0000-0000-000000000020','stage_1','Shares task 30','todo','8c000000-0000-0000-0000-000000000010',null,'8c000000-0000-0000-0000-000000000010');
insert into public.tasks(id,project_id,stage,title,status,assignee_id,completed_area_m2,created_by) values('8c000000-0000-0000-0000-000000000031','8c000000-0000-0000-0000-000000000020','stage_3','Shares task 31','todo','8c000000-0000-0000-0000-000000000010',null,'8c000000-0000-0000-0000-000000000010');
insert into public.tasks(id,project_id,stage,title,status,assignee_id,completed_area_m2,created_by) values('8c000000-0000-0000-0000-000000000032','8c000000-0000-0000-0000-000000000020','stage_2','Shares task 32','todo','8c000000-0000-0000-0000-000000000010',7,'8c000000-0000-0000-0000-000000000010');
insert into public.tasks(id,project_id,stage,title,status,assignee_id,completed_area_m2,created_by) values('8c000000-0000-0000-0000-000000000033','8c000000-0000-0000-0000-000000000021','stage_1','Shares task 33','todo','8c000000-0000-0000-0000-000000000010',null,'8c000000-0000-0000-0000-000000000010');
insert into public.tasks(id,project_id,stage,title,status,assignee_id,completed_area_m2,created_by) values('8c000000-0000-0000-0000-000000000034','8c000000-0000-0000-0000-000000000022','stage_1','Shares task 34','todo','8c000000-0000-0000-0000-000000000012',null,'8c000000-0000-0000-0000-000000000012');
update public.tasks set status='completed' where id in (
  '8c000000-0000-0000-0000-000000000030','8c000000-0000-0000-0000-000000000031',
  '8c000000-0000-0000-0000-000000000032','8c000000-0000-0000-0000-000000000033','8c000000-0000-0000-0000-000000000034');
-- Create voided audit history, then a new active completion.
update public.tasks set status='todo' where id='8c000000-0000-0000-0000-000000000033';
update public.tasks set status='completed' where id='8c000000-0000-0000-0000-000000000033';
create temporary table completion_history as select id,contributor_id,contributor_name,contributor_job_title,completed_at,voided_at
from public.productivity_attributions where studio_id='8c000000-0000-0000-0000-000000000001';
select is((select productivity_stage_1_percent from public.studios where id='8c000000-0000-0000-0000-000000000001'),20::numeric,'existing studios retain 20/80 by default');
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000030' and voided_at is null),20::numeric,'original completion starts with 20 percent');

select set_config('request.jwt.claim.sub','8c000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select throws_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001',30)$$,'42501','Only active studio administrators can change productivity stage shares','employee cannot change shares');
reset role;
select set_config('request.jwt.claim.sub','8c000000-0000-0000-0000-000000000012',true);
set local role authenticated;
select throws_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001',30)$$,'42501','Only active studio administrators can change productivity stage shares','another studio admin cannot change shares');
reset role;
select set_config('request.jwt.claim.sub','8c000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select throws_ok($$update public.studios set productivity_stage_1_percent=30 where id='8c000000-0000-0000-0000-000000000001'$$,'42501',null,'direct writes remain forbidden');
select throws_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001',-1)$$,'22023','Enter a percentage from 0 to 100','rejects -1');
select throws_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001',101)$$,'22023','Enter a percentage from 0 to 100','rejects 101');
select throws_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001',null)$$,'22023','Enter a percentage from 0 to 100','rejects null');
select throws_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001','NaN'::numeric)$$,'22023','Enter a percentage from 0 to 100','rejects NaN::numeric');
select throws_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001','Infinity'::numeric)$$,'22023','Enter a percentage from 0 to 100','rejects Infinity::numeric');
select lives_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001',30)$$,'admin can save 30/70');
reset role;
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000030' and voided_at is null),30::numeric,'existing Stage 1 credit is recalculated');
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000031' and voided_at is null),70::numeric,'existing Stage 3 credit is recalculated');
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000033' and voided_at is null),60::numeric,'every studio project is recalculated');
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000033' and voided_at is not null),40::numeric,'voided audit area is unchanged');
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000034' and voided_at is null),20::numeric,'another studio retains its credit');
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000032' and voided_at is null),7::numeric,'Stage 2 keeps its task-area snapshot');
select is((select productivity_budget_m2 from public.project_stage_productivity_budgets where project_id='8c000000-0000-0000-0000-000000000020' and stage='stage_1'),30::numeric,'stage budget follows the setting');
select is((select allocated_productivity_m2 from public.project_stage_productivity_budgets where project_id='8c000000-0000-0000-0000-000000000020' and stage='stage_1'),30::numeric,'allocated budget follows active credits');
select is((select count(*) from ((select * from completion_history except select id,contributor_id,contributor_name,contributor_job_title,completed_at,voided_at from public.productivity_attributions where studio_id='8c000000-0000-0000-0000-000000000001') union all (select id,contributor_id,contributor_name,contributor_job_title,completed_at,voided_at from public.productivity_attributions where studio_id='8c000000-0000-0000-0000-000000000001' except select * from completion_history)) delta),0::bigint,'completion identities, dates and counts are unchanged');

-- A failure after rebalancing the first project must roll back the whole save.
create function pg_temp.reject_shares_rebalance() returns trigger language plpgsql as $$begin
  if new.project_id='8c000000-0000-0000-0000-000000000021' and new.stage='stage_3' then raise exception 'forced rebalance failure'; end if;
  return new;
end;$$;
create trigger reject_shares_rebalance before insert or update on public.project_stage_productivity_budgets for each row execute function pg_temp.reject_shares_rebalance();
set local role authenticated;
select throws_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001',40)$$,'P0001','forced rebalance failure','partial rebalance fails atomically');
reset role;
select is((select productivity_stage_1_percent from public.studios where id='8c000000-0000-0000-0000-000000000001'),30::numeric,'failed save restores studio percentage');
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000030' and voided_at is null),30::numeric,'failed save restores already-rebalanced credit');
drop trigger reject_shares_rebalance on public.project_stage_productivity_budgets;

set local role authenticated;
select lives_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001',0)$$,'zero share is supported');
reset role;
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000030' and voided_at is null),0::numeric,'zero share retains a countable completion');
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000031' and voided_at is null),100::numeric,'complement receives the full budget');
set local role authenticated;
select lives_ok($$select public.save_productivity_stage_shares('8c000000-0000-0000-0000-000000000001',37.5)$$,'fractional percentages are supported');
reset role;
select is((select credited_area_m2 from public.productivity_attributions where task_id='8c000000-0000-0000-0000-000000000031' and voided_at is null),62.5::numeric,'fractional complement is exact');

select * from finish();
rollback;
