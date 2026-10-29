begin;
select no_plan();
insert into public.studios(id,name) values
 ('95000000-0000-0000-0000-000000000001','Feedback A'),('95000000-0000-0000-0000-000000000002','Feedback B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('95000000-0000-0000-0000-000000000010','authenticated','authenticated','template-admin@example.test','{}','{}',now(),now()),
 ('95000000-0000-0000-0000-000000000011','authenticated','authenticated','template-employee@example.test','{}','{}',now(),now()),
 ('95000000-0000-0000-0000-000000000012','authenticated','authenticated','template-foreign@example.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values
 ('95000000-0000-0000-0000-000000000010','Admin','template-admin@example.test','admin'),
 ('95000000-0000-0000-0000-000000000011','Employee','template-employee@example.test','employee'),
 ('95000000-0000-0000-0000-000000000012','Foreign','template-foreign@example.test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values
 ('95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000010','admin'),
 ('95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000011','employee'),
 ('95000000-0000-0000-0000-000000000002','95000000-0000-0000-0000-000000000012','admin');
insert into public.projects(id,studio_id,name,total_area_m2,status,created_by) values
 ('95000000-0000-0000-0000-000000000020','95000000-0000-0000-0000-000000000001','Project A',100,'archived','95000000-0000-0000-0000-000000000010'),
 ('95000000-0000-0000-0000-000000000021','95000000-0000-0000-0000-000000000002','Project B',100,'active','95000000-0000-0000-0000-000000000012');

-- First invitation uses the published original, including for an archived project.
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.create_project_feedback('95000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'first use initializes original publication');
select is((select version from public.feedback_template_versions),1,'initial published version');
select is((select count(*)::integer from public.feedback_templates),1,'one template per studio');
set local role postgres;
create temp table original as select id,token,template_version_id from public.project_feedback where studio_id='95000000-0000-0000-0000-000000000001';
create temp table draft(config jsonb);
insert into draft select jsonb_set(private.default_feedback_template(),'{title}','"A new questionnaire"') || jsonb_build_object('questions', (private.default_feedback_template()->'questions') || '[
 {"id":"95000000-0000-0000-0000-000000000030","type":"text","label":"Describe the handover","visible":true,"required":true,"options":[]},
 {"id":"95000000-0000-0000-0000-000000000031","type":"rating","label":"Handover quality","visible":true,"required":false,"options":[]},
 {"id":"95000000-0000-0000-0000-000000000032","type":"choice","label":"Preferred format","visible":true,"required":true,"options":["Online","In person"]}
 ]'::jsonb);
grant select on original,draft to authenticated,service_role;
set local role authenticated;
select is(public.save_feedback_template('95000000-0000-0000-0000-000000000001',(select config from draft),0,false),1,'save draft increments revision');
select is((select count(*)::integer from public.feedback_template_versions),1,'saving draft never publishes');
select lives_ok($$select public.create_project_feedback('95000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'create while draft exists');
select is((select count(distinct template_version_id)::integer from public.project_feedback),1,'draft cannot affect invitations');
select throws_like($$select public.save_feedback_template('95000000-0000-0000-0000-000000000001',(select config from draft),0,true)$$,'%feedback_draft_conflict%','stale administrator cannot overwrite draft');
select is(public.save_feedback_template('95000000-0000-0000-0000-000000000001',(select config from draft),1,true),2,'publish saved draft atomically');
select is((select count(*)::integer from public.feedback_template_versions),2,'publication appends a version');
select is((select template_version_id from public.project_feedback where id=(select id from original)),(select template_version_id from original),'original invitation version frozen');
select lives_ok($$select public.create_project_feedback('95000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'new invitation created from publication');
select is((select count(distinct template_version_id)::integer from public.project_feedback),2,'new invitation uses new version');
select throws_like($$update public.feedback_template_versions set config='{}'$$,'%permission denied%','admin cannot mutate historical publications');
select throws_like($$update public.feedback_templates set draft='{}'$$,'%permission denied%','draft writes require guarded RPC');
select throws_like($$select public.save_feedback_template('95000000-0000-0000-0000-000000000001',jsonb_set((select config from draft),'{questions,0,type}','"text"'),2,true)$$,'%feedback_invalid_template%','standard metric type fixed');
select throws_like($$select public.save_feedback_template('95000000-0000-0000-0000-000000000001',jsonb_set((select config from draft),'{questions,0,id}','"changed"'),2,true)$$,'%feedback_invalid_template%','standard metric identity fixed');
set local role postgres;
select throws_like($$update public.feedback_template_versions set studio_name='changed'$$,'%feedback_version_immutable%','published branding immutable at database boundary');
create temp table published as select f.token,f.id from public.project_feedback f join public.feedback_template_versions v on v.id=f.template_version_id where v.studio_id='95000000-0000-0000-0000-000000000001' and v.version=2;
create temp table response(answers jsonb);
insert into response values ('{"satisfaction":5,"communication":4,"timeliness":3,"expectations":5,"recommendation":9,"strengths":"Legacy strength","improvements":"","95000000-0000-0000-0000-000000000030":"Careful handover","95000000-0000-0000-0000-000000000031":4,"95000000-0000-0000-0000-000000000032":"Online"}');
grant select on published,response to service_role,authenticated;
set local role service_role;
select throws_like($$select public.submit_versioned_feedback((select token from published),(select answers-'95000000-0000-0000-0000-000000000030' from response))$$,'%feedback_invalid_response%','required custom answer enforced');
select throws_like($$select public.submit_versioned_feedback((select token from published),jsonb_set((select answers from response),'{95000000-0000-0000-0000-000000000032}','"Other"'))$$,'%feedback_invalid_response%','choice must belong to invitation snapshot');
select throws_like($$select public.submit_versioned_feedback((select token from published),jsonb_set((select answers from response),'{95000000-0000-0000-0000-000000000031}','6'))$$,'%feedback_invalid_response%','custom rating scale fixed');
select throws_like($$select public.submit_versioned_feedback((select token from published),(select answers || '{"studio_id":"spoof"}' from response))$$,'%feedback_invalid_response%','unknown answer IDs rejected');
select throws_like($$select public.submit_versioned_feedback((select token from published),jsonb_set((select answers from response),'{95000000-0000-0000-0000-000000000031}','""'))$$,'%feedback_invalid_response%','empty numeric answer cannot poison analytics');
select ok(public.submit_versioned_feedback((select token from published),(select answers from response)),'snapshot validates and saves custom answers');
select ok(public.submit_project_feedback((select token from original),1,2,3,4,6,'Original response',''),'already-issued legacy form still submits');
set local role authenticated;
select is((select additional_answers->>'95000000-0000-0000-0000-000000000030' from public.project_feedback_responses where invitation_id=(select id from published)),'Careful handover','custom response readable by owner admin');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'summary'->0->>'responses')::int,2,'received count');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->>'invitations')::int,3,'response-rate denominator includes pending invitation');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'summary'->0->>'nps')::numeric,0::numeric,'NPS 9 promoter and 6 detractor');
select is(jsonb_array_length(public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'additional'),3,'each custom question gets separate statistics');
select is((select (value->>'average')::numeric from jsonb_array_elements(public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'additional') where value->'question'->>'type'='rating'),4::numeric,'custom rating average');
select is((select value->'distribution'->>'Online' from jsonb_array_elements(public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'additional') where value->'question'->>'type'='choice'),'1','choice distribution');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001',now()+interval '1 day')->>'invitations')::int,0,'period filter excludes cohort');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001',null,null,'95000000-0000-0000-0000-000000000021')->>'invitations')::int,0,'project filter excludes unrelated project');
-- Reusing an ID with changed meaning must not merge published results.
select is(public.save_feedback_template('95000000-0000-0000-0000-000000000001',jsonb_set((select config from draft),'{questions,8,label}','"A different rating"'),2,true),3,'later publication changes custom wording');
select lives_ok($$select public.create_project_feedback('95000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'invitation for third publication');
set local role postgres;
create temp table third as select f.id,f.token from public.project_feedback f join public.feedback_template_versions v on v.id=f.template_version_id where v.studio_id='95000000-0000-0000-0000-000000000001' and v.version=3;
grant select on third to service_role,authenticated;
set local role service_role;
select ok(public.submit_versioned_feedback((select token from third),(select jsonb_set(answers,'{recommendation}','8') from response)),'NPS passive answer');
set local role authenticated;
select is(jsonb_array_length(public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'additional'),6,'custom metrics separated by publication even when ID reused');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'summary'->0->>'nps')::numeric,0::numeric,'NPS includes passive in denominator');
select is((select strengths from public.project_feedback_responses where invitation_id=(select id from original)),'Original response','old response preserved after repeated publication');
select is(public.save_feedback_template('95000000-0000-0000-0000-000000000001',jsonb_set((select config from draft),'{questions,4,visible}','false'),3,true),4,'hide NPS without changing its identity or scale');
select lives_ok($$select public.create_project_feedback('95000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'invitation without NPS');
set local role postgres;
create temp table hidden as select f.token from public.project_feedback f join public.feedback_template_versions v on v.id=f.template_version_id where v.studio_id='95000000-0000-0000-0000-000000000001' and v.version=4;
grant select on hidden to service_role,authenticated;
set local role service_role;
select throws_like($$select public.submit_versioned_feedback((select token from hidden),(select answers from response))$$,'%feedback_invalid_response%','hidden metrics cannot be injected');
select ok(public.submit_versioned_feedback((select token from hidden),(select answers-'recommendation' from response)),'hidden NPS stored as missing, never zero');
set local role postgres;
select throws_like($$update public.project_feedback_responses set satisfaction=2 where invitation_id=(select id from original)$$,'%feedback_response_immutable%','database protects old submitted answers from mutation');
select throws_like($$update public.project_feedback set template_version_id=(select template_version_id from third join public.project_feedback using(id)) where id=(select id from original)$$,'%feedback_invitation_immutable%','database protects response version');
select throws_like($$insert into public.project_feedback(studio_id,project_id,created_by,expires_at,template_version_id) values ('95000000-0000-0000-0000-000000000002','95000000-0000-0000-0000-000000000021','95000000-0000-0000-0000-000000000012',now()+interval '1 day',(select template_version_id from original))$$,'%project_feedback_template_version_id_studio_id_fkey%','composite FK blocks foreign studio template substitution');
set local role authenticated;
select is((select recommendation from public.project_feedback_responses where invitation_id=(select id from public.project_feedback where token=(select token from hidden))),null::smallint,'missing NPS is SQL NULL');
-- Known NPS boundaries: 0,6 detractors; 7,8 passives; 9,10 promoters.
set local role postgres;
insert into public.project_feedback(studio_id,project_id,created_by,expires_at,template_version_id)
select '95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000020','95000000-0000-0000-0000-000000000010',now()+interval '1 day',(select template_version_id from original) from generate_series(1,3);
select public.submit_project_feedback(token,5,5,5,5,case row_number() over(order by id) when 1 then 0 when 2 then 7 else 10 end,'','') from public.project_feedback where studio_id='95000000-0000-0000-0000-000000000001' and not exists(select 1 from public.project_feedback_responses r where r.invitation_id=project_feedback.id) and template_version_id=(select template_version_id from original);
set local role authenticated;
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'summary'->0->>'nps')::numeric,round(100.0*(3-2)/7,20),'NPS boundaries and denominator exclude missing NPS');
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000011',true);
select is((select count(*)::int from public.feedback_templates),0,'employee cannot read drafts');
select is((select count(*)::int from public.feedback_template_versions),0,'employee cannot read published templates');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->>'invitations')::int,0,'employee cannot aggregate invitations');
select throws_like($$select public.save_feedback_template('95000000-0000-0000-0000-000000000001',(select config from draft),4,true)$$,'%feedback_forbidden%','employee cannot publish');
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000012',true);
select is((select count(*)::int from public.feedback_template_versions),0,'foreign admin cannot read versions');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->>'invitations')::int,0,'foreign admin cannot aggregate invitations');
select is(jsonb_array_length(public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'additional'),0,'foreign admin cannot see custom texts');
select throws_like($$select public.save_feedback_template('95000000-0000-0000-0000-000000000001',(select config from draft),4,true)$$,'%feedback_forbidden%','foreign admin cannot alter template');
set local role anon;
select throws_like($$select * from public.feedback_templates$$,'%permission denied%','anonymous cannot read drafts');
select throws_like($$select * from public.feedback_template_versions$$,'%permission denied%','anonymous cannot enumerate publications');
select throws_like($$select public.submit_versioned_feedback(repeat('a',64),'{}')$$,'%permission denied%','anonymous cannot invoke submission RPC');
select throws_like($$select public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')$$,'%permission denied%','anonymous cannot read analytics');
set local role service_role;
select ok(public.submit_versioned_feedback((select token from published),(select answers from response)),'same versioned link accepts another client');
set local role authenticated;
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000010',true);
select is((select count(*)::int from public.project_feedback_responses where invitation_id=(select id from published)),2,'both custom responses retained');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'summary'->0->>'responses')::int,9,'analytics counts every response including shared links');
select is((public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->>'answeredInvitations')::int,8,'response rate counts each answered invitation only once');
select is((select value->'distribution'->>'Online' from jsonb_array_elements(public.get_feedback_analytics('95000000-0000-0000-0000-000000000001')->'additional') where value->>'version'='2' and value->'question'->>'type'='choice'),'2','choice distribution counts both clients');
select * from finish();
rollback;
