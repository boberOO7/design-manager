begin;
insert into public.studios(id,name) values
 ('7b000000-0000-0000-0000-000000000001','Stage editor'),
 ('7b000000-0000-0000-0000-000000000002','Foreign studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('7b000000-0000-0000-0000-000000000010','authenticated','authenticated','stage-editor-admin@example.test','{}','{}',now(),now()),
 ('7b000000-0000-0000-0000-000000000011','authenticated','authenticated','stage-editor-employee@example.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values
 ('7b000000-0000-0000-0000-000000000010','Stage admin','stage-editor-admin@example.test','admin'),
 ('7b000000-0000-0000-0000-000000000011','Stage employee','stage-editor-employee@example.test','employee');
insert into public.studio_members(studio_id,user_id,system_role) values
 ('7b000000-0000-0000-0000-000000000001','7b000000-0000-0000-0000-000000000010','admin'),
 ('7b000000-0000-0000-0000-000000000001','7b000000-0000-0000-0000-000000000011','employee');
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values
 ('7b000000-0000-0000-0000-000000000020','7b000000-0000-0000-0000-000000000001','Stage editor project',100,'active',current_date,'7b000000-0000-0000-0000-000000000010'),
 ('7b000000-0000-0000-0000-000000000021','7b000000-0000-0000-0000-000000000002','Foreign project',100,'active',current_date,'7b000000-0000-0000-0000-000000000010');
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values
 ('7b000000-0000-0000-0000-000000000020','7b000000-0000-0000-0000-000000000010','designer',0,current_date),
 ('7b000000-0000-0000-0000-000000000020','7b000000-0000-0000-0000-000000000011','designer',0,current_date);
insert into public.tasks(id,project_id,stage,title,description,status,priority,assignee_id,created_by,completed_area_m2,progress_weight) values
 ('7b000000-0000-0000-0000-000000000030','7b000000-0000-0000-0000-000000000020','stage_2','Source room','Structural instructions','in_progress','urgent','7b000000-0000-0000-0000-000000000011','7b000000-0000-0000-0000-000000000010',30,3),
 ('7b000000-0000-0000-0000-000000000031','7b000000-0000-0000-0000-000000000020','stage_2','Other room',null,'todo','normal',null,'7b000000-0000-0000-0000-000000000010',70,1),
 ('7b000000-0000-0000-0000-000000000032','7b000000-0000-0000-0000-000000000020','stage_4','Different stage',null,'todo','normal',null,'7b000000-0000-0000-0000-000000000010',null,1);
insert into public.task_collaborators(task_id,user_id) values ('7b000000-0000-0000-0000-000000000030','7b000000-0000-0000-0000-000000000010');
insert into public.task_deadlines(task_id,target_status,due_date) values ('7b000000-0000-0000-0000-000000000030','completed',current_date+10);
update public.tasks set production_completion=42,manual_progress_override=true where id='7b000000-0000-0000-0000-000000000030';
update public.project_task_stage_columns set progress_method='area' where project_id='7b000000-0000-0000-0000-000000000020' and stage='stage_2';
select set_config('request.jwt.claim.sub','7b000000-0000-0000-0000-000000000010',true);
set local role authenticated;

do $test$
declare
 v_project_id constant uuid := '7b000000-0000-0000-0000-000000000020';
 source_id constant uuid := '7b000000-0000-0000-0000-000000000030';
 other_id constant uuid := '7b000000-0000-0000-0000-000000000031';
 template_a uuid;
 template_b uuid;
 duplicate_id uuid;
 before_structure jsonb;
 before_items uuid[];
 updates jsonb;
 creates jsonb;
begin
 template_a := public.save_checklist_template('7b000000-0000-0000-0000-000000000001','A','[{"title":"First","weight":2},{"title":"Second","weight":3}]');
 template_b := public.save_checklist_template('7b000000-0000-0000-0000-000000000001','B','[{"title":"Replacement","weight":4}]');
 perform public.set_task_checklist_template(source_id,template_a);
 update public.task_checklist_items set title='Customized item',is_completed=true where task_id=source_id and position=0;
 update public.task_checklist_items set is_not_needed=true where task_id=source_id and position=1;
 select jsonb_build_object('title',title,'completed_area_m2',completed_area_m2,'checklist_template_id',checklist_template_id)
 into before_structure from public.tasks where id=other_id;
 updates := jsonb_build_array(before_structure || jsonb_build_object('id',other_id,'previous',before_structure,'completed_area_m2',80,'checklist_template_id',template_b));
 creates := jsonb_build_array(
   jsonb_build_object('title','Duplicate room','completed_area_m2',20,'checklist_template_id',template_a,'source_task_id',source_id),
   jsonb_build_object('title','New room','completed_area_m2',null,'checklist_template_id',template_b,'source_task_id',null)
 );
 -- Deletion frees area and preserves the duplicate's snapshot before source removal.
 perform public.save_stage_task_structure(v_project_id,'stage_2',updates,creates,array[source_id]);
 if exists(select 1 from public.tasks where id=source_id) then raise exception 'Source was not deleted'; end if;
 select id into duplicate_id from public.tasks where tasks.project_id=v_project_id and title='Duplicate room';
 if not exists(select 1 from public.tasks where id=duplicate_id and status='todo' and priority='normal'
   and description='Structural instructions' and progress_weight=3 and completed_area_m2=20
   and assignee_id is null and completed_at is null and due_date is null and start_date is null
   and production_completion=0 and not manual_progress_override and checklist_template_id=template_a)
   then raise exception 'Duplicate lost structure or inherited operational state'; end if;
 if exists(select 1 from public.task_collaborators where task_id=duplicate_id)
   or exists(select 1 from public.task_deadlines where task_id=duplicate_id)
   or exists(select 1 from public.task_schedules where task_id=duplicate_id)
   or exists(select 1 from public.task_checklist_items where task_id=duplicate_id and (is_completed or is_not_needed))
   or (select array_agg(title order by position) from public.task_checklist_items where task_id=duplicate_id)
      is distinct from array['Customized item','Second']::text[]
   then raise exception 'Duplicate copied operational children or lost checklist customization'; end if;
 if (select count(*) from public.task_status_periods where task_id=duplicate_id) <> 1
   or not exists(select 1 from public.task_status_periods where task_id=duplicate_id and status='todo' and exited_at is null)
   then raise exception 'Duplicate inherited history'; end if;
 if (select count(*) from public.task_checklist_items where task_id=other_id and title='Replacement') <> 1 then raise exception 'Checklist change failed'; end if;

 -- Increases supplied first must still wait for reductions; unchanged checklist keeps item identity.
 select array_agg(id order by position) into before_items from public.task_checklist_items where task_id=duplicate_id;
 select jsonb_agg(jsonb_build_object('id',id,'title',title,'completed_area_m2',case when id=duplicate_id then 40 else 60 end,
   'checklist_template_id',checklist_template_id,'previous',jsonb_build_object('title',title,'completed_area_m2',completed_area_m2,'checklist_template_id',checklist_template_id))
   order by case when id=duplicate_id then 0 else 1 end) into updates from public.tasks where id in (duplicate_id,other_id);
 perform public.save_stage_task_structure(v_project_id,'stage_2',updates,'[]','{}');
 if (select sum(completed_area_m2) from public.tasks where tasks.project_id=v_project_id and stage='stage_2') <> 100
   or (select array_agg(id order by position) from public.task_checklist_items where task_id=duplicate_id) is distinct from before_items
   then raise exception 'Area redistribution or checklist preservation failed'; end if;

 -- Stale structure must roll back a deletion and every other change in the batch.
 begin
   perform public.save_stage_task_structure(v_project_id,'stage_2',updates,'[]',array[(select id from public.tasks where tasks.project_id=v_project_id and title='New room')]);
   raise exception 'Stale batch accepted';
 exception when serialization_failure then null;
 end;
 if not exists(select 1 from public.tasks where tasks.project_id=v_project_id and title='New room') then raise exception 'Failed batch partly deleted'; end if;

 -- Later workflow checklists are immutable and failure rolls back the whole batch.
 update public.task_checklist_items set is_completed=true where task_id=duplicate_id;
 update public.tasks set status='internal_review' where id=duplicate_id;
 select jsonb_build_object('title',title,'completed_area_m2',completed_area_m2,'checklist_template_id',checklist_template_id)
 into before_structure from public.tasks where id=duplicate_id;
 begin
   perform public.save_stage_task_structure(v_project_id,'stage_2',
     jsonb_build_array(before_structure || jsonb_build_object('id',duplicate_id,'previous',before_structure,'checklist_template_id',template_b)),
     '[]',array[other_id]);
   raise exception 'Review checklist changed';
 exception when raise_exception then
   if sqlerrm <> 'Checklist editing is available only to task editors while the task is To do or In progress' then raise; end if;
 end;
 if not exists(select 1 from public.tasks where id=other_id) then raise exception 'Guard failed to roll back deletion'; end if;
 begin
   perform public.save_stage_task_structure(v_project_id,'stage_2','[]','[]',array['7b000000-0000-0000-0000-000000000032'::uuid]);
   raise exception 'Cross-stage deletion accepted';
 exception when serialization_failure then null;
 end;
 begin
   perform public.save_stage_task_structure('7b000000-0000-0000-0000-000000000021','stage_2','[]','[]','{}');
   raise exception 'Foreign project accepted';
 exception when raise_exception then
   if sqlerrm <> 'This project stage is read-only or unavailable' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub','7b000000-0000-0000-0000-000000000011',true);
 begin
   perform public.save_stage_task_structure(v_project_id,'stage_2','[]','[]',array[other_id]);
   raise exception 'Employee deleted a task';
 exception when raise_exception then
   if sqlerrm <> 'This project stage is read-only or unavailable' then raise; end if;
 end;
end
$test$;
reset role;

-- Lifecycle restrictions match ordinary task deletion.
update public.projects set status='archived',archived_at=current_date where id='7b000000-0000-0000-0000-000000000020';
select set_config('request.jwt.claim.sub','7b000000-0000-0000-0000-000000000010',true);
set local role authenticated;
do $test$
begin
 begin
   perform public.save_stage_task_structure('7b000000-0000-0000-0000-000000000020','stage_4','[]','[]',array['7b000000-0000-0000-0000-000000000032'::uuid]);
   raise exception 'Archived task deletion accepted';
 exception when raise_exception then
   if sqlerrm <> 'This project stage is read-only or unavailable' then raise; end if;
 end;
end
$test$;
reset role;
set local role anon;
do $test$
begin
 begin
   perform public.save_stage_task_structure('7b000000-0000-0000-0000-000000000020','stage_2','[]','[]','{}');
   raise exception 'Anonymous execution accepted';
 exception when insufficient_privilege then null;
 end;
end
$test$;
rollback;
