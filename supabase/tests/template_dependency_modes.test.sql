begin;
select plan(14);

insert into public.studios (id,name) values ('88000000-0000-0000-0000-000000000001','Dependency mode studio');
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('88000000-0000-0000-0000-000000000010','authenticated','authenticated','dependency-admin@example.test','{}','{}',now(),now()),
 ('88000000-0000-0000-0000-000000000011','authenticated','authenticated','dependency-employee@example.test','{}','{}',now(),now());
insert into public.profiles (id,full_name,email,system_role) values
 ('88000000-0000-0000-0000-000000000010','Dependency admin','dependency-admin@example.test','admin'),
 ('88000000-0000-0000-0000-000000000011','Dependency employee','dependency-employee@example.test','employee');
insert into public.studio_members (studio_id,user_id,system_role) values
 ('88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000010','admin'),
 ('88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000011','employee');
insert into public.projects (id,studio_id,name,project_type,total_area_m2,status,start_date,created_by)
 values ('88000000-0000-0000-0000-000000000020','88000000-0000-0000-0000-000000000001','Dependency project','private',100,'active','2026-10-05','88000000-0000-0000-0000-000000000010');
create temp table saved_template (id uuid);
grant select,insert on saved_template to authenticated;

select set_config('request.jwt.claim.sub','88000000-0000-0000-0000-000000000010',true);
set local role authenticated;
insert into saved_template select public.save_project_template(
 '88000000-0000-0000-0000-000000000001','private','Ordered chain',true,false,
 '[{"stage":"stage_1","title":"A","priority":"normal","expected_workdays":1,"dependency_mode":"independent","depends_on_positions":[]},
 {"stage":"stage_1","title":"B","priority":"normal","expected_workdays":1,"dependency_mode":"after_previous","depends_on_positions":[0]},
 {"stage":"stage_1","title":"C","priority":"normal","expected_workdays":1,"dependency_mode":"after_previous","depends_on_positions":[1]}]'::jsonb);
select is((select dependency_mode from public.project_template_tasks where template_id=(select id from saved_template) and title='C'),'after_previous','ordered mode persists');
select is((select depends_on_positions from public.project_template_tasks where template_id=(select id from saved_template) and title='C'),'{1}'::integer[],'C stores only its direct predecessor B');
select is(public.apply_project_template_stage(
 '88000000-0000-0000-0000-000000000020',(select id from saved_template),
 'stage_1','stage_1','2026-10-05'),3,'ordered chain applies through existing stage copy');
select is((select count(*)::integer from public.task_schedule_dependencies dependency
 join public.tasks task on task.id=dependency.task_id
 where task.project_id='88000000-0000-0000-0000-000000000020'),2,'runtime graph has exactly two direct chain edges');

select is(public.save_project_template(
 '88000000-0000-0000-0000-000000000001','private','Reordered chain',true,false,
 '[{"stage":"stage_1","title":"A","priority":"normal","expected_workdays":1,"dependency_mode":"independent","depends_on_positions":[]},
 {"stage":"stage_1","title":"C","priority":"normal","expected_workdays":1,"dependency_mode":"after_previous","depends_on_positions":[0]},
 {"stage":"stage_1","title":"B","priority":"normal","expected_workdays":1,"dependency_mode":"after_previous","depends_on_positions":[1]}]'::jsonb,
 (select id from saved_template)),(select id from saved_template),'reordered template saves');
select is((select depends_on_positions from public.project_template_tasks where template_id=(select id from saved_template) and title='B'),'{1}'::integer[],'B now follows C by order');

select is(public.save_project_template(
 '88000000-0000-0000-0000-000000000001','private','Parallel merge',true,false,
 '[{"stage":"stage_1","title":"A","priority":"normal","expected_workdays":1,"dependency_mode":"independent","depends_on_positions":[]},
 {"stage":"stage_1","title":"B","priority":"normal","expected_workdays":1,"dependency_mode":"independent","depends_on_positions":[]},
 {"stage":"stage_1","title":"C","priority":"normal","expected_workdays":1,"dependency_mode":"custom","depends_on_positions":[0,1]}]'::jsonb,
 (select id from saved_template)),(select id from saved_template),'parallel tasks can feed one custom merge');
select is((select depends_on_positions from public.project_template_tasks where template_id=(select id from saved_template) and title='C'),'{0,1}'::integer[],'merge keeps both meaningful direct edges');
select throws_like($$select public.save_project_template(
 '88000000-0000-0000-0000-000000000001','private','Redundant',true,false,
 '[{"stage":"stage_1","title":"A","priority":"normal","expected_workdays":1,"dependency_mode":"independent","depends_on_positions":[]},
 {"stage":"stage_1","title":"B","priority":"normal","expected_workdays":1,"dependency_mode":"after_previous","depends_on_positions":[0]},
 {"stage":"stage_1","title":"C","priority":"normal","expected_workdays":1,"dependency_mode":"custom","depends_on_positions":[0,1]}]'::jsonb)$$,
 '%Remove redundant direct dependencies%','transitive A edge on C is rejected');
select throws_like($$select public.save_project_template(
 '88000000-0000-0000-0000-000000000001','private','Forward',true,false,
 '[{"stage":"stage_1","title":"A","priority":"normal","expected_workdays":1,"dependency_mode":"custom","depends_on_positions":[1]},
 {"stage":"stage_1","title":"B","priority":"normal","expected_workdays":1,"dependency_mode":"custom","depends_on_positions":[0]}]'::jsonb)$$,
 '%Dependencies must reference earlier scheduled tasks%','forward or cyclic custom edges are rejected');
select throws_like($$select public.save_project_template(
 '88000000-0000-0000-0000-000000000001','private','Wrong previous',true,false,
 '[{"stage":"stage_1","title":"A","priority":"normal","expected_workdays":1,"dependency_mode":"independent","depends_on_positions":[]},
 {"stage":"stage_1","title":"B","priority":"normal","expected_workdays":1,"dependency_mode":"independent","depends_on_positions":[]},
 {"stage":"stage_1","title":"C","priority":"normal","expected_workdays":1,"dependency_mode":"after_previous","depends_on_positions":[0]}]'::jsonb)$$,
 '%Dependencies must reference earlier scheduled tasks%','after-previous cannot point around B');
select throws_like($$select public.save_project_template(
 '88000000-0000-0000-0000-000000000001','private','No predecessor duration',true,false,
 '[{"stage":"stage_1","title":"A","priority":"normal","dependency_mode":"independent","depends_on_positions":[]},
 {"stage":"stage_1","title":"B","priority":"normal","expected_workdays":1,"dependency_mode":"after_previous","depends_on_positions":[0]}]'::jsonb)$$,
 '%Dependencies must reference earlier scheduled tasks%','scheduled after-previous requires duration on the preceding task');
select throws_like($$select public.save_project_template(
 '88000000-0000-0000-0000-000000000001','private','First after previous',true,false,
 '[{"stage":"stage_1","title":"A","priority":"normal","expected_workdays":1,"dependency_mode":"after_previous","depends_on_positions":[]}]'::jsonb)$$,
 '%Dependencies must reference earlier scheduled tasks%','first stage task cannot follow a nonexistent predecessor');
select set_config('request.jwt.claim.sub','88000000-0000-0000-0000-000000000011',true);
select throws_like($$select public.save_project_template(
 '88000000-0000-0000-0000-000000000001','private','Employee edit',true,false,'[]'::jsonb)$$,
 '%Only studio administrators%','employee cannot change template dependency modes');

select * from finish();
rollback;
