begin;
select plan(61);

insert into public.studios (id,name) values ('87000000-0000-0000-0000-000000000001','Schedule studio');
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('87000000-0000-0000-0000-000000000010','authenticated','authenticated','schedule-admin@example.test','{}','{}',now(),now()),
 ('87000000-0000-0000-0000-000000000011','authenticated','authenticated','schedule-employee@example.test','{}','{}',now(),now());
insert into public.profiles (id,full_name,email,system_role) values
 ('87000000-0000-0000-0000-000000000010','Schedule admin','schedule-admin@example.test','admin'),
 ('87000000-0000-0000-0000-000000000011','Schedule employee','schedule-employee@example.test','employee');
insert into public.studio_members (studio_id,user_id,system_role) values
 ('87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000010','admin'),
 ('87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000011','employee');
insert into public.projects (id,studio_id,name,project_type,total_area_m2,status,start_date,created_by)
 values ('87000000-0000-0000-0000-000000000020','87000000-0000-0000-0000-000000000001','Schedule project','private',100,'active','2026-09-14','87000000-0000-0000-0000-000000000010');
insert into public.project_templates (id,studio_id,project_type,name,is_active,created_by)
 values ('87000000-0000-0000-0000-000000000040','87000000-0000-0000-0000-000000000001','private','Branch template',true,'87000000-0000-0000-0000-000000000010');
insert into public.project_template_tasks (id,template_id,stage,title,priority,position,expected_workdays,depends_on_positions) values
 ('87000000-0000-0000-0000-000000000050','87000000-0000-0000-0000-000000000040','stage_1','A','normal',0,2,'{}'),
 ('87000000-0000-0000-0000-000000000051','87000000-0000-0000-0000-000000000040','stage_1','B','normal',1,3,'{0}'),
 ('87000000-0000-0000-0000-000000000052','87000000-0000-0000-0000-000000000040','stage_1','C','normal',2,1,'{0}'),
 ('87000000-0000-0000-0000-000000000053','87000000-0000-0000-0000-000000000040','stage_1','D','normal',3,1,'{1,2}');

select set_config('request.jwt.claim.sub','87000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select is(public.apply_project_template_stage(
 '87000000-0000-0000-0000-000000000020','87000000-0000-0000-0000-000000000040',
 'stage_1','stage_1','2026-09-14'),4,'applying a scheduled stage copies four tasks');
select is((select count(*)::integer from public.task_schedules where project_id='87000000-0000-0000-0000-000000000020' and is_blocked),3,'new dependent tasks start blocked');
select ok(has_column_privilege('authenticated','public.project_task_stage_columns','progress_method','UPDATE'),'stage progress setting remains writable');
select is((select baseline_due from public.task_schedules s join public.tasks t on t.id=s.task_id where t.title='A' and t.project_id='87000000-0000-0000-0000-000000000020'),'2026-09-15'::date,'two workdays include the Monday anchor');
select is((select baseline_due from public.task_schedules s join public.tasks t on t.id=s.task_id where t.title='B' and t.project_id='87000000-0000-0000-0000-000000000020'),'2026-09-18'::date,'first branch spans Wednesday through Friday');
select is((select baseline_due from public.task_schedules s join public.tasks t on t.id=s.task_id where t.title='C' and t.project_id='87000000-0000-0000-0000-000000000020'),'2026-09-16'::date,'parallel branch begins after A');
select is((select baseline_due from public.task_schedules s join public.tasks t on t.id=s.task_id where t.title='D' and t.project_id='87000000-0000-0000-0000-000000000020'),'2026-09-21'::date,'joined successor waits for the longer branch');
select is((select count(*)::integer from public.task_schedule_dependencies d join public.tasks t on t.id=d.task_id where t.project_id='87000000-0000-0000-0000-000000000020'),4,'both branches and the join keep their dependency edges');
select throws_like(
 $$select public.save_project_template('87000000-0000-0000-0000-000000000001','private','Invalid',true,false,
 '[{"stage":"stage_1","title":"First","priority":"normal","expected_workdays":1,"depends_on_positions":[1]},
 {"stage":"stage_1","title":"Second","priority":"normal","expected_workdays":1}]'::jsonb)$$,
 '%Dependencies must reference earlier scheduled tasks%','forward or cyclic template edges are rejected');
select lives_ok(
 $$insert into public.task_deadlines(task_id,target_status,due_date)
 select id,'review','2026-09-17' from public.tasks
 where project_id='87000000-0000-0000-0000-000000000020' and title='B'$$,
 'a client review milestone can be added to a scheduled task');
select lives_ok(
 $$select public.bulk_set_project_task_deadline('87000000-0000-0000-0000-000000000020','stage_1',
 array(select id from public.tasks where project_id='87000000-0000-0000-0000-000000000020' and title='A'),
 'internal_review','2026-09-17')$$,'moving A two workdays later succeeds');
set local role postgres;
select is((select current_due from public.task_schedules s join public.tasks t on t.id=s.task_id where t.title='B' and t.project_id='87000000-0000-0000-0000-000000000020'),private.schedule_add_workdays(private.schedule_add_workdays(greatest('2026-09-17'::date,private.schedule_workday_on_or_after((now() at time zone 'Europe/Kyiv')::date)),1),2),'B shifts to the earliest feasible working days');
select is((select deadline.due_date from public.task_deadlines deadline join public.tasks t on t.id=deadline.task_id
 where t.title='B' and t.project_id='87000000-0000-0000-0000-000000000020' and deadline.target_status='review'),
 private.schedule_add_workdays(greatest('2026-09-17'::date,private.schedule_workday_on_or_after((now() at time zone 'Europe/Kyiv')::date)),2),'review milestone shifts with the delayed scheduled start');
set local role authenticated;
select throws_like(
 $$select public.bulk_set_project_task_deadline('87000000-0000-0000-0000-000000000020','stage_1',
 array(select id from public.tasks where project_id='87000000-0000-0000-0000-000000000020' and title='B'),
 'internal_review','2026-09-17')$$,
 '%Scheduled internal review deadline must remain feasible%','manual review deadline cannot precede scheduled work');
set local role postgres;
select is((select current_due from public.task_schedules s join public.tasks t on t.id=s.task_id where t.title='D' and t.project_id='87000000-0000-0000-0000-000000000020'),private.schedule_add_workdays(greatest('2026-09-17'::date,private.schedule_workday_on_or_after((now() at time zone 'Europe/Kyiv')::date)),4),'the joined successor follows the shifted longer branch');
select is((select baseline_due from public.task_schedules s join public.tasks t on t.id=s.task_id where t.title='D' and t.project_id='87000000-0000-0000-0000-000000000020'),'2026-09-21'::date,'manual change never rewrites baseline');
create temp table before_earlier_move as
 select t.title,s.current_start,s.current_due from public.task_schedules s
 join public.tasks t on t.id=s.task_id
 where t.project_id='87000000-0000-0000-0000-000000000020' and t.title in ('B','D');
set local role authenticated;
select lives_ok(
 $$select public.bulk_set_project_task_deadline('87000000-0000-0000-0000-000000000020','stage_1',
 array(select id from public.tasks where project_id='87000000-0000-0000-0000-000000000020' and title='A'),
 'internal_review','2026-09-16')$$,'moving A earlier is accepted');
set local role postgres;
select is((select s.current_due from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.project_id='87000000-0000-0000-0000-000000000020' and t.title='B'),
 (select current_due from before_earlier_move where title='B'),'earlier upstream date does not pull B');
select is((select s.current_due from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.project_id='87000000-0000-0000-0000-000000000020' and t.title='D'),
 (select current_due from before_earlier_move where title='D'),'earlier upstream date does not pull transitive D');
set local role authenticated;
select lives_ok(
 $$select public.bulk_set_project_task_deadline('87000000-0000-0000-0000-000000000020','stage_1',
 array(select id from public.tasks where project_id='87000000-0000-0000-0000-000000000020' and title='A'),
 'internal_review','2026-09-17')$$,'restoring A date leaves the chain feasible');
set local role authenticated;
select throws_like(
 $$select public.bulk_set_project_task_deadline('87000000-0000-0000-0000-000000000020','stage_1',
 array(select id from public.tasks where project_id='87000000-0000-0000-0000-000000000020' and title='A'),
 'internal_review','2026-09-14')$$,
 '%remain feasible%','manual deadline cannot be earlier than its own duration');
select lives_ok(
 $$update public.tasks set status='internal_review'
 where project_id='87000000-0000-0000-0000-000000000020' and title='A'$$,
 'factual internal-review handoff succeeds');
set local role postgres;
select is((select current_start from public.task_schedules s join public.tasks t on t.id=s.task_id where t.title='B' and t.project_id='87000000-0000-0000-0000-000000000020'),
 private.schedule_add_workdays((now() at time zone 'Europe/Kyiv')::date,1),'unfinished successor starts after actual handoff');
select is((select current_due from public.task_schedules s join public.tasks t on t.id=s.task_id where t.title='A' and t.project_id='87000000-0000-0000-0000-000000000020'),'2026-09-17'::date,'handed-off predecessor retains its planned history');
select is((select completion.completed_on from public.task_deadline_completions completion
 join public.tasks task on task.id=completion.task_id
 where task.project_id='87000000-0000-0000-0000-000000000020'
   and task.title='A' and completion.target_status='internal_review' and completion.voided_at is null),
 (now() at time zone 'Europe/Kyiv')::date,'first internal-review entry records the actual schedule milestone');
select is((select completion.due_date from public.task_deadline_completions completion
 join public.tasks task on task.id=completion.task_id
 where task.project_id='87000000-0000-0000-0000-000000000020'
   and task.title='A' and completion.target_status='internal_review' and completion.voided_at is null),
 '2026-09-17'::date,'late handoff is compared with the original scheduled review deadline');
select is((select current_due from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.project_id='87000000-0000-0000-0000-000000000020' and t.title='D'),
 private.schedule_add_workdays((now() at time zone 'Europe/Kyiv')::date,4),
 'late actual handoff cascades through the joined successor');
create temp table first_handoff as
 select completion.id,completion.completed_on from public.task_deadline_completions completion
 join public.tasks task on task.id=completion.task_id
 where task.project_id='87000000-0000-0000-0000-000000000020'
   and task.title='A' and completion.target_status='internal_review' and completion.voided_at is null;
set local role authenticated;
select lives_ok($$update public.tasks set status='in_progress'
 where project_id='87000000-0000-0000-0000-000000000020' and title='A'$$,
 'review can return work without voiding its first schedule milestone');
set local role postgres;
select is((select count(*)::integer from public.task_deadline_completions completion
 join public.tasks task on task.id=completion.task_id
 where task.project_id='87000000-0000-0000-0000-000000000020'
   and task.title='A' and completion.target_status='internal_review' and completion.voided_at is null),
 1,'reopening keeps one active first handoff');
select is((select is_blocked from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.project_id='87000000-0000-0000-0000-000000000020' and t.title='B'),
 false,'a reopened predecessor with a recorded handoff does not reblock B');
set local role authenticated;
select lives_ok($$update public.tasks set status='internal_review'
 where project_id='87000000-0000-0000-0000-000000000020' and title='A'$$,
 'later review entry succeeds without replacing the first');
set local role postgres;
select is((select completion.id from public.task_deadline_completions completion
 join public.tasks task on task.id=completion.task_id
 where task.project_id='87000000-0000-0000-0000-000000000020'
   and task.title='A' and completion.target_status='internal_review' and completion.voided_at is null),
 (select id from first_handoff),'later review entry preserves the first completion record');
select is((select s.current_due from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.project_id='87000000-0000-0000-0000-000000000020' and t.title='A'),
 '2026-09-17'::date,'scheduling-completed A remains fixed after reopen');
select set_config('request.jwt.claim.sub','87000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.set_project_stage_schedule_paused('87000000-0000-0000-0000-000000000020','stage_1',true)$$,'stage schedule can pause');
select is((select count(*)::integer from public.task_schedules where project_id='87000000-0000-0000-0000-000000000020' and is_paused),3,'all unfinished tasks are marked paused');
set local role postgres;
create temp table schedule_before_resume as
 select t.title,s.current_due from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.project_id='87000000-0000-0000-0000-000000000020';
update public.project_task_stage_columns set schedule_paused_on=current_date-3
 where project_id='87000000-0000-0000-0000-000000000020' and stage='stage_1';
select set_config('request.jwt.claim.sub','87000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.set_project_stage_schedule_paused('87000000-0000-0000-0000-000000000020','stage_1',false)$$,'stage schedule can resume');
set local role postgres;
select is((select s.current_due from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.title='B' and t.project_id='87000000-0000-0000-0000-000000000020'),
 (select private.schedule_add_workdays(current_due,private.schedule_workdays_elapsed(current_date-3,current_date))
 from schedule_before_resume where title='B'),'resume shifts remaining dates by paused working days');
select is((select s.current_due from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.title='A' and t.project_id='87000000-0000-0000-0000-000000000020'),
 (select current_due from schedule_before_resume where title='A'),'resume does not move completed history');
select set_config('request.jwt.claim.sub','87000000-0000-0000-0000-000000000011',true);
set local role authenticated;
select throws_like(
 $$select public.set_project_stage_schedule_paused('87000000-0000-0000-0000-000000000020','stage_1',true)$$,
 '%administrators%','employee cannot pause a stage schedule');
select set_config('request.jwt.claim.sub','87000000-0000-0000-0000-000000000010',true);
select throws_like(
 $$delete from public.task_deadlines where task_id=(select id from public.tasks where project_id='87000000-0000-0000-0000-000000000020' and title='A')$$,
 '%permission denied%','direct deadline deletion cannot desynchronize a schedule');


-- A reached milestone and a surviving dependent retain coherent state.
select lives_ok($$update public.tasks set status='internal_review'
 where project_id='87000000-0000-0000-0000-000000000020' and title='B'$$,
 'a review milestone can be reached');
set local role postgres;
create temp table reached_review_due as
 select deadline.due_date from public.task_deadlines deadline join public.tasks task on task.id=deadline.task_id
 where task.project_id='87000000-0000-0000-0000-000000000020'
   and task.title='B' and deadline.target_status='internal_review';
update public.task_schedules schedule set
 current_start=private.schedule_add_workdays(current_start,1),
 current_due=private.schedule_add_workdays(current_due,1)
 where task_id=(select id from public.tasks where project_id='87000000-0000-0000-0000-000000000020' and title='B');
select is((select deadline.due_date from public.task_deadlines deadline join public.tasks task on task.id=deadline.task_id
 where task.project_id='87000000-0000-0000-0000-000000000020'
   and task.title='B' and deadline.target_status='internal_review'),
 (select due_date from reached_review_due),'reached review milestone does not move');
set local role authenticated;
select lives_ok($$delete from public.tasks where project_id='87000000-0000-0000-0000-000000000020'
 and title in ('B','C')$$,'administrator may delete scheduled predecessor tasks');
select is((select schedule.is_blocked from public.task_schedules schedule join public.tasks task on task.id=schedule.task_id
 where task.project_id='87000000-0000-0000-0000-000000000020' and task.title='D'),false,
 'deleting the last unfinished predecessors unblocks the survivor');

-- A page refresh advances blocked work even when no task status changed.
select set_config('request.jwt.claim.sub','87000000-0000-0000-0000-000000000010',true);
set local role postgres;
insert into public.projects (id,studio_id,name,project_type,total_area_m2,status,start_date,created_by)
 values ('87000000-0000-0000-0000-000000000021','87000000-0000-0000-0000-000000000001','Unfinished predecessor project','private',100,'active','2026-09-14','87000000-0000-0000-0000-000000000010');
set local role authenticated;
select is(public.apply_project_template_stage(
 '87000000-0000-0000-0000-000000000021','87000000-0000-0000-0000-000000000040',
 'stage_1','stage_1','2026-09-14'),4,'a second schedule can be applied');
select lives_ok($$select public.refresh_project_task_schedules(array['87000000-0000-0000-0000-000000000021']::uuid[])$$,
 'reading the schedule refreshes its unfinished dependencies');
set local role postgres;
select is((select s.current_start from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.title='B' and t.project_id='87000000-0000-0000-0000-000000000021'),
 private.schedule_add_workdays(private.schedule_workday_on_or_after((now() at time zone 'Europe/Kyiv')::date),1),
 'overdue unfinished A pushes B to the next feasible working day');
select is((select s.is_blocked from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.project_id='87000000-0000-0000-0000-000000000021' and t.title='B'),
 true,'unfinished predecessor keeps B blocked');
select ok((select d.due_date >= (now() at time zone 'Europe/Kyiv')::date
 from public.task_deadlines d join public.tasks t on t.id=d.task_id
 where t.project_id='87000000-0000-0000-0000-000000000021'
   and t.title='B' and d.target_status='internal_review'),
 'blocked B schedule deadline stays out of the past');
set local role authenticated;
select lives_ok($$update public.tasks set status='internal_review'
 where project_id='87000000-0000-0000-0000-000000000021' and title='B'$$,
 'a blocked dependent can hand off its work');
set local role postgres;
select is((select s.is_blocked from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.project_id='87000000-0000-0000-0000-000000000021' and t.title='B'),false,
 'handoff clears stale blocked state without moving its schedule');
select is(private.schedule_add_workdays(private.schedule_workday_on_or_after('2026-09-26'),1),
 '2026-09-29'::date,'a weekend cannot count as predecessor working time');
update public.projects set status='archived', archived_at=(now() at time zone 'Europe/Kyiv')::date
 where id='87000000-0000-0000-0000-000000000021';
update public.task_schedules set current_start='2026-09-16',current_due='2026-09-18'
 where task_id=(select id from public.tasks where project_id='87000000-0000-0000-0000-000000000021' and title='B');
set local role authenticated;
select lives_ok($$select public.refresh_project_task_schedules(array['87000000-0000-0000-0000-000000000021']::uuid[])$$,
 'refreshing an archived project is allowed to read its stored schedule');
set local role postgres;
select is((select s.current_start from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.title='B' and t.project_id='87000000-0000-0000-0000-000000000021'),
 '2026-09-16'::date,'archived schedule history does not move on refresh');

-- Completed projects keep Stage 4 operational while production history stays fixed.
insert into public.projects (id,studio_id,name,project_type,total_area_m2,status,start_date,completed_at,created_by)
 values ('87000000-0000-0000-0000-000000000022','87000000-0000-0000-0000-000000000001','Completed Stage 4 project','private',100,'completed','2026-09-14','2026-09-14','87000000-0000-0000-0000-000000000010');
set local role authenticated;
select is(public.apply_project_template_stage(
 '87000000-0000-0000-0000-000000000022','87000000-0000-0000-0000-000000000040',
 'stage_1','stage_4','2026-09-14'),4,'completed project can apply scheduled Stage 4 work');
select lives_ok($$select public.refresh_project_task_schedules(array['87000000-0000-0000-0000-000000000022']::uuid[])$$,
 'completed project refreshes operational Stage 4 schedule');
set local role postgres;
select is((select s.current_start from public.task_schedules s join public.tasks t on t.id=s.task_id
 where t.title='B' and t.project_id='87000000-0000-0000-0000-000000000022'),
 private.schedule_add_workdays(private.schedule_workday_on_or_after((now() at time zone 'Europe/Kyiv')::date),1),
 'completed project Stage 4 dependent remains feasible');

-- A backward first entry still counts; passing through client review does not.
insert into public.projects (id,studio_id,name,project_type,total_area_m2,status,start_date,created_by)
 values ('87000000-0000-0000-0000-000000000023','87000000-0000-0000-0000-000000000001',
 'Backward review project','private',100,'active','2026-09-17','87000000-0000-0000-0000-000000000010');
insert into public.tasks(id,project_id,title,stage,status,priority,created_by)
 values ('87000000-0000-0000-0000-000000000063','87000000-0000-0000-0000-000000000023','Backward review','stage_1','todo','normal','87000000-0000-0000-0000-000000000010');
insert into public.task_schedules(task_id,project_id,stage,sort_order,expected_workdays,baseline_start,baseline_due,current_start,current_due)
 values ('87000000-0000-0000-0000-000000000063','87000000-0000-0000-0000-000000000023','stage_1',0,2,'2026-09-17','2026-09-18','2026-09-17','2026-09-18');
insert into public.task_deadlines(task_id,target_status,due_date)
 values ('87000000-0000-0000-0000-000000000063','internal_review','2026-09-18');
update public.tasks set status='review' where id='87000000-0000-0000-0000-000000000063';
select is((select count(*)::integer from public.task_deadline_completions
 where task_id='87000000-0000-0000-0000-000000000063' and target_status='internal_review' and voided_at is null),
 0,'skipping directly to client review does not invent an internal handoff');
update public.tasks set status='internal_review' where id='87000000-0000-0000-0000-000000000063';
select is((select count(*)::integer from public.task_deadline_completions
 where task_id='87000000-0000-0000-0000-000000000063' and target_status='internal_review' and voided_at is null),
 1,'first backward entry into internal review records the handoff');
update public.tasks set status='in_progress' where id='87000000-0000-0000-0000-000000000063';
select is((select count(*)::integer from public.task_deadline_completions
 where task_id='87000000-0000-0000-0000-000000000063' and target_status='internal_review' and voided_at is null),
 1,'reopening preserves the backward handoff');
update public.tasks set status='internal_review' where id='87000000-0000-0000-0000-000000000063';
select is((select count(*)::integer from public.task_deadline_completions
 where task_id='87000000-0000-0000-0000-000000000063' and target_status='internal_review' and voided_at is null),
 1,'later review entries do not replace a backward first handoff');

select * from finish();
rollback;
