begin;
select no_plan();

insert into public.studios (id, name) values ('8b000000-0000-0000-0000-000000000001', 'Equal stage productivity studio');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('8b000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'stage-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('8b000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'stage-employee@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, full_name, email, system_role) values
  ('8b000000-0000-0000-0000-000000000010', 'Stage admin', 'stage-admin@example.test', 'admin'),
  ('8b000000-0000-0000-0000-000000000011', 'Stage employee', 'stage-employee@example.test', 'employee');
insert into public.studio_members (studio_id, user_id, system_role) values
  ('8b000000-0000-0000-0000-000000000001', '8b000000-0000-0000-0000-000000000010', 'admin'),
  ('8b000000-0000-0000-0000-000000000001', '8b000000-0000-0000-0000-000000000011', 'employee');
insert into public.projects (id, studio_id, name, total_area_m2, status, start_date, created_by) values
  ('8b000000-0000-0000-0000-000000000020', '8b000000-0000-0000-0000-000000000001', 'Two tasks before completion', 20, 'active', current_date, '8b000000-0000-0000-0000-000000000010'),
  ('8b000000-0000-0000-0000-000000000021', '8b000000-0000-0000-0000-000000000001', 'Tasks added later', 20, 'active', current_date, '8b000000-0000-0000-0000-000000000010'),
  ('8b000000-0000-0000-0000-000000000022', '8b000000-0000-0000-0000-000000000001', 'Stage three and other stages', 20, 'active', current_date, '8b000000-0000-0000-0000-000000000010'),
  ('8b000000-0000-0000-0000-000000000023', '8b000000-0000-0000-0000-000000000001', 'Zero-area stage', 0, 'active', current_date, '8b000000-0000-0000-0000-000000000010');
insert into public.project_members (project_id, user_id, project_role, assigned_area_m2, assigned_at)
select project.id, member.id, 'designer', 0, current_date
from public.projects project cross join public.profiles member
where project.id in ('8b000000-0000-0000-0000-000000000020', '8b000000-0000-0000-0000-000000000021', '8b000000-0000-0000-0000-000000000022', '8b000000-0000-0000-0000-000000000023')
  and member.id in ('8b000000-0000-0000-0000-000000000010', '8b000000-0000-0000-0000-000000000011');

insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('8b000000-0000-0000-0000-000000000030', '8b000000-0000-0000-0000-000000000020', 'stage_1', 'A', 'todo', '8b000000-0000-0000-0000-000000000010', '8b000000-0000-0000-0000-000000000010'),
  ('8b000000-0000-0000-0000-000000000031', '8b000000-0000-0000-0000-000000000020', 'stage_1', 'B', 'todo', '8b000000-0000-0000-0000-000000000011', '8b000000-0000-0000-0000-000000000010');
update public.tasks set status = 'completed' where id in ('8b000000-0000-0000-0000-000000000030', '8b000000-0000-0000-0000-000000000031');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000030' and voided_at is null), 2::numeric, 'two pre-existing Stage 1 tasks split 50/50');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000031' and voided_at is null), 2::numeric, 'different employee receives the same share');
select is((select count(distinct contributor_id)::integer from public.productivity_attributions where project_id = '8b000000-0000-0000-0000-000000000020' and voided_at is null), 2, 'completion identity remains per employee');

insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('8b000000-0000-0000-0000-000000000032', '8b000000-0000-0000-0000-000000000021', 'stage_1', 'Early task', 'todo', '8b000000-0000-0000-0000-000000000010', '8b000000-0000-0000-0000-000000000010');
update public.tasks set status = 'completed' where id = '8b000000-0000-0000-0000-000000000032';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000032' and voided_at is null), 4::numeric, 'early completion initially owns Stage 1 budget');
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('8b000000-0000-0000-0000-000000000033', '8b000000-0000-0000-0000-000000000021', 'stage_1', 'Later task', 'todo', '8b000000-0000-0000-0000-000000000011', '8b000000-0000-0000-0000-000000000010');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000032' and voided_at is null), 2::numeric, 'adding an unfinished task rebalances earlier completion');
update public.tasks set status = 'completed' where id = '8b000000-0000-0000-0000-000000000033';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000033' and voided_at is null), 2::numeric, 'later completion receives half');
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('8b000000-0000-0000-0000-000000000034', '8b000000-0000-0000-0000-000000000021', 'stage_1', 'Third task', 'todo', '8b000000-0000-0000-0000-000000000011', '8b000000-0000-0000-0000-000000000010');
update public.tasks set status = 'completed' where id = '8b000000-0000-0000-0000-000000000034';
select ok((select max(credited_area_m2) - min(credited_area_m2) <= 0.000000000001 from public.productivity_attributions where project_id = '8b000000-0000-0000-0000-000000000021' and task_stage = 'stage_1' and voided_at is null), 'three tasks each receive approximately one third');
select is((select sum(credited_area_m2) from public.productivity_attributions where project_id = '8b000000-0000-0000-0000-000000000021' and task_stage = 'stage_1' and voided_at is null), 4::numeric, 'three rounded shares preserve exact budget');
update public.tasks set status = 'cancelled' where id = '8b000000-0000-0000-0000-000000000034';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000032' and voided_at is null), 2::numeric, 'cancellation rebalances remaining tasks');
select is((select count(*)::integer from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000034' and voided_at is null), 0, 'cancelled completion is voided');
update public.tasks set status = 'todo' where id = '8b000000-0000-0000-0000-000000000033';
select is((select count(*)::integer from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000033' and voided_at is null), 0, 'reopening removes active completion count');
update public.tasks set status = 'completed' where id = '8b000000-0000-0000-0000-000000000033';
select is((select count(*)::integer from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000033' and voided_at is null), 1, 'recompletion creates exactly one active row');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000033' and voided_at is null), 2::numeric, 'recompletion receives current share');
update public.projects set total_area_m2 = 40 where id = '8b000000-0000-0000-0000-000000000021';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000032' and voided_at is null), 4::numeric, 'project-area change rebalances completed credit');
select is((select productivity_budget_m2 from public.project_stage_productivity_budgets where project_id = '8b000000-0000-0000-0000-000000000021' and stage = 'stage_1'), 8::numeric, 'budget table follows current project area');

delete from public.tasks where id = '8b000000-0000-0000-0000-000000000033';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000032' and voided_at is null), 8::numeric, 'deleting a task gives remaining task the full current budget');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000033' and voided_at is null), 0::numeric, 'deleted task keeps its historical completion count but no area');

insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('8b000000-0000-0000-0000-000000000035', '8b000000-0000-0000-0000-000000000022', 'stage_3', 'Stage 3 first', 'todo', '8b000000-0000-0000-0000-000000000010', '8b000000-0000-0000-0000-000000000010');
update public.tasks set status = 'completed' where id = '8b000000-0000-0000-0000-000000000035';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000035' and voided_at is null), 16::numeric, 'Stage 3 initially credits 80%');
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('8b000000-0000-0000-0000-000000000036', '8b000000-0000-0000-0000-000000000022', 'stage_3', 'Stage 3 second', 'todo', '8b000000-0000-0000-0000-000000000011', '8b000000-0000-0000-0000-000000000010');
update public.tasks set status = 'completed' where id = '8b000000-0000-0000-0000-000000000036';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000035' and voided_at is null), 8::numeric, 'Stage 3 earlier credit rebalances');
select is((select sum(credited_area_m2) from public.productivity_attributions where project_id = '8b000000-0000-0000-0000-000000000022' and task_stage = 'stage_3' and voided_at is null), 16::numeric, 'Stage 3 never exceeds 80%');
select set_config('request.jwt.claim.sub', '8b000000-0000-0000-0000-000000000010', true);
update public.tasks set stage = 'stage_1' where id = '8b000000-0000-0000-0000-000000000036';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000035' and voided_at is null), 16::numeric, 'moving a task restores the original Stage 3 share');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000036' and voided_at is null), 4::numeric, 'moved completion receives its new Stage 1 share');
select is((select task_stage from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000036' and voided_at is null), 'stage_1', 'active ledger stage follows an eligible task move');
update public.tasks set stage = 'stage_2', completed_area_m2 = 3 where id = '8b000000-0000-0000-0000-000000000036';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000036' and voided_at is null), 3::numeric, 'moving out of Stage 1 uses Stage 2 task area');
update public.tasks set status = 'todo' where id = '8b000000-0000-0000-0000-000000000036';
update public.tasks set status = 'completed' where id = '8b000000-0000-0000-0000-000000000036';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000036' and voided_at is null), 3::numeric, 'Stage 2 recompletion retains its task-area snapshot');

insert into public.tasks (id, project_id, stage, title, status, assignee_id, completed_area_m2, created_by) values
  ('8b000000-0000-0000-0000-000000000037', '8b000000-0000-0000-0000-000000000022', 'stage_2', 'Stage 2', 'todo', '8b000000-0000-0000-0000-000000000011', 7, '8b000000-0000-0000-0000-000000000010');
insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('8b000000-0000-0000-0000-000000000038', '8b000000-0000-0000-0000-000000000022', 'stage_4', 'Stage 4', 'todo', '8b000000-0000-0000-0000-000000000011', '8b000000-0000-0000-0000-000000000010');
update public.tasks set status = 'completed' where id in ('8b000000-0000-0000-0000-000000000037', '8b000000-0000-0000-0000-000000000038');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000037' and voided_at is null), 7::numeric, 'Stage 2 retains task area');
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000038' and voided_at is null), 0::numeric, 'Stage 4 retains zero area count');
update public.projects set include_in_productivity = false where id = '8b000000-0000-0000-0000-000000000022';
select is((select count(*)::integer from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000038' and voided_at is null), 1, 'excluded project still retains completion row');

insert into public.tasks (id, project_id, stage, title, status, assignee_id, created_by) values
  ('8b000000-0000-0000-0000-000000000039', '8b000000-0000-0000-0000-000000000023', 'stage_1', 'Zero-budget Stage 1 task', 'todo', '8b000000-0000-0000-0000-000000000011', '8b000000-0000-0000-0000-000000000010');
update public.tasks set status = 'completed' where id = '8b000000-0000-0000-0000-000000000039';
select is((select credited_area_m2 from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000039' and voided_at is null), 0::numeric, 'zero-budget Stage 1 completion keeps a zero-area row');
update public.tasks set status = 'todo' where id = '8b000000-0000-0000-0000-000000000039';
select is((select count(*)::integer from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000039' and voided_at is null), 0, 'zero-area reopening removes active count');
update public.tasks set status = 'completed' where id = '8b000000-0000-0000-0000-000000000039';
select is((select count(*)::integer from public.productivity_attributions where task_id = '8b000000-0000-0000-0000-000000000039' and voided_at is null), 1, 'zero-area recompletion restores one active count');

select * from finish();
rollback;
