begin;
insert into public.studios(id,name) values('ca000000-0000-4000-8000-000000000001','Creation test'),('ca000000-0000-4000-8000-000000000002','Other studio');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('ca000000-0000-4000-8000-000000000010','authenticated','authenticated','creation@test.local','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values('ca000000-0000-4000-8000-000000000010','Creation admin','creation@test.local','admin');
insert into public.studio_members(studio_id,user_id,system_role) values('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000010','admin');
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000010',true);
insert into public.project_templates(id,studio_id,project_type,name,is_active,is_default,created_by) values
('ca000000-0000-4000-8000-000000000020','ca000000-0000-4000-8000-000000000001','private','Facade',true,false,'ca000000-0000-4000-8000-000000000010'),
('ca000000-0000-4000-8000-000000000021','ca000000-0000-4000-8000-000000000002','private','Foreign',true,false,'ca000000-0000-4000-8000-000000000010');
insert into public.project_template_tasks(template_id,stage,title,priority,position) values
('ca000000-0000-4000-8000-000000000020','stage_1','Concept','normal',0),
('ca000000-0000-4000-8000-000000000020','stage_3','Drawings','normal',0),
('ca000000-0000-4000-8000-000000000020','stage_4','Support','normal',0);
insert into public.crm_leads(id,studio_id,client_name,first_contact_date,status) values('ca000000-0000-4000-8000-000000000030','ca000000-0000-4000-8000-000000000001','Creation lead',current_date,'new');
set local role authenticated;
do $test$
declare
 p jsonb := '{"studio_id":"ca000000-0000-4000-8000-000000000001","name":"Creation test","country_code":"UA","total_area_m2":120,"priority":"normal","start_date":"2026-10-29","due_date":"2026-12-01"}';
 d jsonb := '{"intent":"save","kind":"facade","name":"Facade","areaM2":200,"coefficient":0.35,"templateId":"ca000000-0000-4000-8000-000000000020"}';
 project uuid; facade uuid; before_count integer; bad jsonb;
begin
 project := public.create_project_from_template(p);
 assert (select count(*)=1 from public.project_work_directions where project_id=project), 'legacy creation retains one Interior';
 project := public.create_project_from_template(p || jsonb_build_object('directions',jsonb_build_array(d)));
 assert (select count(*)=2 from public.project_work_directions where project_id=project), 'both directions created';
 assert (select total_area_m2=120 and client_name is null from public.projects where id=project), 'object area and optional client preserved';
 select id into facade from public.project_work_directions where project_id=project and kind='facade';
 assert (select area_m2=200 and complexity_coefficient=0.35 and start_date='2026-10-29' and due_date='2026-12-01' from public.project_work_directions where id=facade), 'independent area/coefficient and inherited dates';
 assert (select count(*)=3 from public.project_task_stage_columns where direction_id=facade), 'template yields two main stages and one additional';
 assert (select count(*)=3 from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage where s.direction_id=facade), 'template tasks scoped to Facade';
 select count(*) into before_count from public.projects;
 p := p || '{"source_lead_id":"ca000000-0000-4000-8000-000000000030"}'::jsonb;
 foreach bad in array array[d || '{"templateId":"ca000000-0000-4000-8000-000000000021"}'::jsonb, d || '{"areaM2":0}'::jsonb, d || '{"intent":"remove"}'::jsonb, d || jsonb_build_object('id',facade)] loop
   begin
     perform public.create_project_from_template(p || jsonb_build_object('directions',jsonb_build_array(d,bad)));
     raise exception 'TEST: invalid creation succeeded';
   exception when others then
     if sqlerrm like 'TEST:%' then raise; end if;
   end;
   assert (select count(*)=before_count from public.projects), 'failure rolls back project and previously created direction';
   assert (select project_id is null and status='new' from public.crm_leads where id='ca000000-0000-4000-8000-000000000030'), 'failed creation leaves lead unchanged';
 end loop;
 project := public.create_project_from_template(p || jsonb_build_object('directions',jsonb_build_array(d)));
 assert (select project_id=project and status='won' from public.crm_leads where id='ca000000-0000-4000-8000-000000000030'), 'successful multi-direction creation converts the lead';
end $test$;
reset role;
rollback;
