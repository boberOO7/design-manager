begin;

insert into public.studios(id,name) values
 ('b6000000-0000-0000-0000-000000000001','Flexible stages'),
 ('b6000000-0000-0000-0000-000000000002','Other studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('b6000000-0000-0000-0000-000000000010','authenticated','authenticated','flexible-admin@example.test','{}','{}',now(),now()),
 ('b6000000-0000-0000-0000-000000000011','authenticated','authenticated','flexible-employee@example.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values
 ('b6000000-0000-0000-0000-000000000010','Stage admin','flexible-admin@example.test','admin'),
 ('b6000000-0000-0000-0000-000000000011','Stage employee','flexible-employee@example.test','employee');
insert into public.studio_members(studio_id,user_id,system_role) values
 ('b6000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000010','admin'),
 ('b6000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000011','employee');
select set_config('request.jwt.claim.sub','b6000000-0000-0000-0000-000000000010',true);
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values
 ('b6000000-0000-0000-0000-000000000020','b6000000-0000-0000-0000-000000000001','Flexible project',100,'planned',current_date,'b6000000-0000-0000-0000-000000000010'),
 ('b6000000-0000-0000-0000-000000000021','b6000000-0000-0000-0000-000000000002','Other project',100,'planned',current_date,'b6000000-0000-0000-0000-000000000010');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values
 ('b6000000-0000-0000-0000-000000000020','b6000000-0000-0000-0000-000000000010','designer',0,current_date),
 ('b6000000-0000-0000-0000-000000000020','b6000000-0000-0000-0000-000000000011','designer',0,current_date);

create function pg_temp.stage_payload(project_id uuid, omitted text[] default '{}') returns jsonb language sql as $$
 select coalesce(jsonb_agg(jsonb_build_object('stage',s.stage,'display_name',coalesce(s.display_name,s.stage),'display_order',s.position,
   'is_enabled',s.is_enabled,'kind',s.kind,'progress_weight',s.progress_weight) order by s.position),'[]'::jsonb)
 from (select s.*,row_number() over(order by s.display_order,s.stage) as position from public.project_task_stage_columns s
   where s.project_id=$1 and s.deleted_at is null and not(s.stage=any(omitted))) s;
$$;

set local role authenticated;
do $test$
#variable_conflict use_variable
declare
 project_id constant uuid := 'b6000000-0000-0000-0000-000000000020';
 work_stage constant text := 'custom_b6000000-0000-0000-0000-000000000001';
 extra_stage constant text := 'custom_b6000000-0000-0000-0000-000000000002';
 work_task uuid; extra_task uuid; returned_task uuid; new_task uuid; payload jsonb; version integer; info jsonb;
begin
 payload := pg_temp.stage_payload(project_id) || jsonb_build_array(
   jsonb_build_object('stage',work_stage,'display_name','Extra work','display_order',5,'is_enabled',true,'kind','work','progress_weight',1),
   jsonb_build_object('stage',extra_stage,'display_name','Extra operations','display_order',6,'is_enabled',true,'kind','additional','progress_weight',1),
   jsonb_build_object('stage','custom_b6000000-0000-0000-0000-000000000003','display_name','Other work','display_order',7,'is_enabled',true,'kind','work','progress_weight',1));
 perform public.update_project_stage_configuration(project_id,payload,true,true,0,'{}');
 assert (select count(*)=7 from public.project_task_stage_columns s where s.project_id=project_id and s.deleted_at is null), 'fifth and sixth stages persist';
 assert (select progress_weight=2 from public.project_task_stage_columns s where s.project_id=project_id and s.stage='stage_2'), 'legacy weights persist';
 assert not has_table_privilege('authenticated','public.project_task_stage_columns','INSERT'), 'no direct structural insert grant';
 assert not has_column_privilege('authenticated','public.project_task_stage_columns','kind','UPDATE'), 'no direct kind update grant';
 begin
  perform public.update_project_stage_configuration(project_id,payload,false,false,0,'{}');
  raise exception 'stale configuration accepted';
 exception when raise_exception then if sqlerrm<>'stage_version_conflict' then raise; end if; end;
 assert (select include_in_productivity and show_progress from public.projects where id=project_id), 'failed transaction preserves flags';
 begin
  perform public.update_project_stage_configuration(project_id,'[]',true,true,1,'{}');
  raise exception 'zero stages accepted';
 exception when raise_exception then if sqlerrm<>'stage_minimum_stage' then raise; end if; end;
 begin
  perform public.update_project_stage_configuration(project_id,jsonb_set(payload,'{4,kind}','"additional"'),true,true,1,'{}');
  raise exception 'kind mutation accepted';
 exception when raise_exception then if sqlerrm<>'stage_invalid_configuration' then raise; end if; end;
 begin
  perform public.update_project_stage_configuration('b6000000-0000-0000-0000-000000000021',payload,true,true,0,'{}');
  raise exception 'foreign admin write accepted';
 exception when raise_exception then if sqlerrm<>'stage_not_admin' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','b6000000-0000-0000-0000-000000000011',true);
 begin
  perform public.update_project_stage_configuration(project_id,payload,true,true,1,'{}');
  raise exception 'employee write accepted';
 exception when raise_exception then if sqlerrm<>'stage_not_admin' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','b6000000-0000-0000-0000-000000000010',true);
 work_task := public.create_task_with_checklist(jsonb_build_object('project_id',project_id,'title','Working task','priority','normal','stage',work_stage,'assignee_id','b6000000-0000-0000-0000-000000000010','collaborator_ids','[]'::jsonb,'deadlines','[]'::jsonb),'[]');
 extra_task := public.create_task_with_checklist(jsonb_build_object('project_id',project_id,'title','Additional task','priority','normal','stage',extra_stage,'assignee_id','b6000000-0000-0000-0000-000000000010','collaborator_ids','[]'::jsonb,'deadlines','[]'::jsonb),'[]');
 assert (select status='planned' from public.projects where id=project_id), 'adding todo work does not activate project';
 update public.tasks set status='in_progress' where id=extra_task;
 assert (select status='planned' from public.projects where id=project_id), 'additional work does not activate project';
 perform public.bulk_assign_project_stage_tasks(project_id,work_stage,'b6000000-0000-0000-0000-000000000010','all');
 perform public.bulk_assign_selected_project_tasks(project_id,work_stage,'b6000000-0000-0000-0000-000000000010',array[work_task]);
 perform public.bulk_configure_task_review(project_id,work_stage,array[work_task],'{}');
 perform public.bulk_set_project_task_deadline(project_id,work_stage,array[work_task],'completed',current_date+7);
 perform public.bulk_move_project_tasks(project_id,work_stage,array['todo'],'in_progress',array[work_task]);
 assert (select status='active' from public.projects where id=project_id), 'custom work activates project';
 info := public.get_project_stage_deletion_info(project_id);
 assert exists(select 1 from jsonb_array_elements(info) i where i->>'stage'=work_stage and i->>'blockReason'='started_tasks'), 'preview explains started-task block';
 payload := pg_temp.stage_payload(project_id,array[work_stage]);
 begin
  perform public.update_project_stage_configuration(project_id,payload,true,true,1,array[work_task]);
  raise exception 'started stage deleted';
 exception when raise_exception then if sqlerrm<>'stage_started_tasks' then raise; end if; end;
 update public.tasks set status='todo' where id=work_task;
 new_task := public.create_task_with_checklist(jsonb_build_object('project_id',project_id,'title','Concurrent new task','priority','normal','stage',work_stage,'assignee_id',null,'collaborator_ids','[]'::jsonb,'deadlines','[]'::jsonb),'[]');
 begin
  perform public.update_project_stage_configuration(project_id,payload,true,true,1,array[work_task]);
  raise exception 'unknown new task deleted';
 exception when raise_exception then if sqlerrm<>'stage_tasks_changed' then raise; end if; end;
 assert (select count(*)=2 from public.tasks where id in (work_task,new_task)), 'changed task roster is preserved';
 -- Returned-to-Todo tasks are deletable; historical visits alone do not block.
 perform public.update_project_stage_configuration(project_id,payload,true,true,1,array[work_task,new_task]);
 assert not exists(select 1 from public.tasks where id in(work_task,new_task)), 'todo tasks delete atomically';
 assert (select deleted_at is not null and not is_enabled from public.project_task_stage_columns s where s.project_id=project_id and s.stage=work_stage), 'stage identity is retained for history';
 begin
  perform public.create_task_with_checklist(jsonb_build_object('project_id',project_id,'title','Deleted target','priority','normal','stage',work_stage,'assignee_id',null,'collaborator_ids','[]'::jsonb,'deadlines','[]'::jsonb),'[]');
  raise exception 'deleted target accepted';
 exception when raise_exception then if sqlerrm<>'Choose an existing project stage' then raise; end if; end;
 returned_task := public.create_task_with_checklist(jsonb_build_object('project_id',project_id,'title','Logged task','priority','normal','stage','stage_2','assignee_id','b6000000-0000-0000-0000-000000000010','collaborator_ids','[]'::jsonb,'deadlines','[]'::jsonb),'[]');
 -- Work log insertion occurs below as the local schema owner; application writes stay guarded.
 perform set_config('flexible_test.logged_task',returned_task::text,true);
 update public.tasks set status='completed' where id=extra_task;
 assert (select count(*)=1 and max(credited_area_m2)=0 from public.productivity_attributions where task_id=extra_task and voided_at is null), 'additional completions count with zero area';
 begin
  update public.projects set status='completed' where id=project_id;
  raise exception 'open working task ignored';
 exception when raise_exception then if sqlerrm<>'A project with open production tasks cannot be completed' then raise; end if; end;
end;
$test$;

set local role postgres;
insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,minutes)
 values('b6000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000010',current_date,'task',current_setting('flexible_test.logged_task')::uuid,10);
set local role authenticated;
do $test$
#variable_conflict use_variable
declare project_id constant uuid := 'b6000000-0000-0000-0000-000000000020'; task_id uuid := current_setting('flexible_test.logged_task')::uuid; payload jsonb; template_id uuid; scheduled_task uuid;
begin
 payload:=pg_temp.stage_payload(project_id,array['stage_2']);
 begin
  perform public.update_project_stage_configuration(project_id,payload,false,false,2,array[task_id]);
  raise exception 'logged stage deleted';
 exception when raise_exception then if sqlerrm<>'stage_logged_work' then raise; end if; end;
 assert exists(select 1 from public.tasks where id=task_id), 'logged task preserved';
 assert (select stage_configuration_version=2 and include_in_productivity and show_progress from public.projects where id=project_id), 'blocked delete is atomic';
 -- Remaining tests cover custom work lifecycle and normal operations.
 update public.tasks set status='completed' where id=task_id;
 update public.projects set status='completed' where id=project_id;
 perform public.create_task_with_checklist(jsonb_build_object('project_id',project_id,'title','After completion','priority','normal','stage','custom_b6000000-0000-0000-0000-000000000002','assignee_id',null,'collaborator_ids','[]'::jsonb,'deadlines','[]'::jsonb),'[]');
 begin
  perform public.create_task_with_checklist(jsonb_build_object('project_id',project_id,'title','Blocked work','priority','normal','stage','custom_b6000000-0000-0000-0000-000000000003','assignee_id',null,'collaborator_ids','[]'::jsonb,'deadlines','[]'::jsonb),'[]');
  raise exception 'custom working stage accepted task after project completion';
 exception when insufficient_privilege then if sqlerrm not like '%row-level security%' then raise; end if; end;
 template_id:=public.save_project_template('b6000000-0000-0000-0000-000000000001','commercial','Custom-stage schedule',true,false,
   '[{"stage":"stage_1","title":"Scheduled operation","priority":"normal","expected_workdays":2,"depends_on_positions":[]}]');
 assert public.apply_project_template_stage(project_id,template_id,'stage_1','custom_b6000000-0000-0000-0000-000000000002',current_date)=1, 'canonical template source copies into a custom additional stage after completion';
 select s.task_id into scheduled_task from public.task_schedules s where s.project_id=project_id and s.stage='custom_b6000000-0000-0000-0000-000000000002';
 assert scheduled_task is not null, 'custom stages support persisted task schedules';
 perform public.set_project_stage_schedule_paused(project_id,'custom_b6000000-0000-0000-0000-000000000002',true,'other');
 perform public.set_project_stage_schedule_paused(project_id,'custom_b6000000-0000-0000-0000-000000000002',false,null);
 perform public.refresh_project_task_schedules(array[project_id]);
 perform public.update_project_stage_configuration(project_id,pg_temp.stage_payload(project_id),false,true,2,'{}');
 assert (select status='completed' and not include_in_productivity from public.projects where id=project_id), 'stage settings remain available for a completed project';
 perform public.update_project_stage_configuration(project_id,pg_temp.stage_payload(project_id,array['stage_3']),false,true,3,'{}');
 assert (select deleted_at is not null from public.project_task_stage_columns s where s.project_id=project_id and s.stage='stage_3'), 'empty stages delete';
 assert not exists(select 1 from jsonb_array_elements(public.get_project_stage_configuration(project_id)->'rows') s where s->>'stage'='stage_3'), 'atomic snapshot does not resurrect removed stages';

end;
$test$;
set constraints all immediate;
rollback;
