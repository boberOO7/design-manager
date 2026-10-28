begin;
select no_plan();
insert into public.studios(id,name) values
 ('97000000-0000-0000-0000-000000000001','Feedback A'),('97000000-0000-0000-0000-000000000002','Feedback B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('97000000-0000-0000-0000-000000000010','authenticated','authenticated','appearance-admin@example.test','{}','{}',now(),now()),
 ('97000000-0000-0000-0000-000000000011','authenticated','authenticated','appearance-employee@example.test','{}','{}',now(),now()),
 ('97000000-0000-0000-0000-000000000012','authenticated','authenticated','appearance-foreign@example.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values
 ('97000000-0000-0000-0000-000000000010','Admin','appearance-admin@example.test','admin'),
 ('97000000-0000-0000-0000-000000000011','Employee','appearance-employee@example.test','employee'),
 ('97000000-0000-0000-0000-000000000012','Foreign','appearance-foreign@example.test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values
 ('97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000010','admin'),
 ('97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000011','employee'),
 ('97000000-0000-0000-0000-000000000002','97000000-0000-0000-0000-000000000012','admin');
insert into public.projects(id,studio_id,name,total_area_m2,status,created_by) values
 ('97000000-0000-0000-0000-000000000020','97000000-0000-0000-0000-000000000001','Project A',100,'archived','97000000-0000-0000-0000-000000000010'),
 ('97000000-0000-0000-0000-000000000021','97000000-0000-0000-0000-000000000002','Project B',100,'active','97000000-0000-0000-0000-000000000012');

select ok(private.validate_feedback_template(private.default_feedback_template()),'legacy questionnaire JSON remains valid without a background');
select ok(private.validate_feedback_template(private.default_feedback_template() || jsonb_build_object('background',preset)), 'accepts preset ' || preset) from unnest(array['original','slate','tinted','paper']) preset;
select is(private.validate_feedback_template(private.default_feedback_template() || '{"background":"#ffffff"}'),false,'arbitrary background colours rejected');
select is(private.validate_feedback_template(private.default_feedback_template() || '{"background":null}'),false,'null background rejected');
select is(private.validate_feedback_template(private.default_feedback_template() || '{"background":1}'),false,'non-string background rejected');
select is(private.validate_feedback_template(private.default_feedback_template() || '{"background":"paper","unexpected":true}'),false,'unknown template keys remain rejected');
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.create_project_feedback('97000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'original publication creates a legacy-compatible invitation');
select is(public.save_feedback_template('97000000-0000-0000-0000-000000000001',(select draft from public.feedback_templates) || '{"background":"paper"}',0,true),1,'paper preset published through existing guarded RPC');
select lives_ok($$select public.create_project_feedback('97000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'new invitation snapshots paper preset');
select is(public.save_feedback_template('97000000-0000-0000-0000-000000000001',(select draft from public.feedback_templates) || '{"background":"slate"}',1,true),2,'later preset change publishes a new version');
select is((select v.config->>'background' from public.project_feedback f join public.feedback_template_versions v on v.id=f.template_version_id where v.version=1),null::text,'old invitation retains the original look');
select is((select v.config->>'background' from public.project_feedback f join public.feedback_template_versions v on v.id=f.template_version_id where v.version=2),'paper','issued paper invitation is unchanged by later studio settings');
select throws_like($$select public.save_feedback_template('97000000-0000-0000-0000-000000000001',(select draft from public.feedback_templates) || '{"background":"custom"}',2,true)$$,'%feedback_invalid_template%','guarded RPC rejects unlisted preset');
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000011',true);
select is((select count(*)::int from public.feedback_template_versions),0,'employee cannot read preset versions');
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000012',true);
select is((select count(*)::int from public.feedback_template_versions),0,'foreign studio cannot read preset versions');
select * from finish();
rollback;
