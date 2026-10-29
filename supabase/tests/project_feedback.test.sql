begin;
select no_plan();
insert into public.studios(id,name) values
 ('94000000-0000-0000-0000-000000000001','Feedback A'),('94000000-0000-0000-0000-000000000002','Feedback B');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('94000000-0000-0000-0000-000000000010','authenticated','authenticated','feedback-admin@example.test','{}','{}',now(),now()),
 ('94000000-0000-0000-0000-000000000011','authenticated','authenticated','feedback-employee@example.test','{}','{}',now(),now()),
 ('94000000-0000-0000-0000-000000000012','authenticated','authenticated','feedback-foreign@example.test','{}','{}',now(),now());
insert into public.profiles(id,full_name,email,system_role) values
 ('94000000-0000-0000-0000-000000000010','Admin','feedback-admin@example.test','admin'),
 ('94000000-0000-0000-0000-000000000011','Employee','feedback-employee@example.test','employee'),
 ('94000000-0000-0000-0000-000000000012','Foreign','feedback-foreign@example.test','admin');
insert into public.studio_members(studio_id,user_id,system_role) values
 ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000010','admin'),
 ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000011','employee'),
 ('94000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000012','admin');
insert into public.projects(id,studio_id,name,total_area_m2,status,created_by) values
 ('94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000001','Project A',100,'archived','94000000-0000-0000-0000-000000000010'),
 ('94000000-0000-0000-0000-000000000021','94000000-0000-0000-0000-000000000002','Project B',100,'active','94000000-0000-0000-0000-000000000012');

select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000010',true);
set local role authenticated;
select lives_ok($$select public.create_project_feedback('94000000-0000-0000-0000-000000000020',now()+interval '30 days')$$,'admin creates invitation for archived project');
select is((select count(*)::integer from public.project_feedback),1,'admin reads own studio invitation');
select ok((select token ~ '^[a-f0-9]{64}$' from public.project_feedback),'256-bit token format');
select throws_like($$select public.create_project_feedback('94000000-0000-0000-0000-000000000021',now()+interval '30 days')$$,'%feedback_forbidden%','foreign project rejected');
select throws_like($$select public.create_project_feedback('94000000-0000-0000-0000-000000000020',now()-interval '1 second')$$,'%feedback_invalid_expiry%','past expiry rejected');
select throws_like($$select public.create_project_feedback('94000000-0000-0000-0000-000000000020','infinity')$$,'%feedback_invalid_expiry%','infinite expiry rejected');
select throws_like($$update public.project_feedback_responses set satisfaction=5$$,'%permission denied%','admins cannot edit response columns');
select throws_like($$insert into public.project_feedback(studio_id,project_id,created_by,expires_at) values ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000010',now()+interval '1 day')$$,'%permission denied%','direct insert cannot forge invitation');
select throws_like($$select public.submit_project_feedback(repeat('a',64),5,5,5,5,10,'','')$$,'%permission denied%','authenticated cannot call public submit RPC directly');
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000011',true);
select is((select count(*)::integer from public.project_feedback),0,'employee cannot read invitations or answers');
select throws_like($$select public.create_project_feedback('94000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'%feedback_forbidden%','employee cannot create invitations');
select is((select responses::integer from public.get_studio_feedback_summary('94000000-0000-0000-0000-000000000001') where period is null),0,'employee cannot aggregate private answers');
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000012',true);
select is((select count(*)::integer from public.project_feedback),0,'foreign admin cannot read invitations');
set local role anon;
select throws_like($$select * from public.project_feedback_responses$$,'%permission denied%','anonymous cannot read responses');
select throws_like($$select * from public.project_feedback$$,'%permission denied%','anonymous cannot read table');
select throws_like($$select public.submit_project_feedback(repeat('a',64),5,5,5,5,10,'','')$$,'%permission denied%','anonymous cannot bypass server validation');
select throws_like($$select public.create_project_feedback('94000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'%permission denied%','anonymous cannot create invitations');

set local role postgres;
-- Set the deterministic token only in this isolated fixture, bypassing identity guards.
set local session_replication_role=replica;
update public.project_feedback set token=repeat('a',64) where studio_id='94000000-0000-0000-0000-000000000001';
set local session_replication_role=origin;
insert into public.project_feedback(studio_id,project_id,created_by,expires_at,token,revoked_at) values
 ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000010',now()-interval '1 day',repeat('b',64),null),
 ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000010',now()+interval '1 day',repeat('c',64),now()),
 ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000010',now()+interval '1 day',repeat('d',64),null),
 ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000010',now()+interval '1 day',repeat('f',64),null);
select throws_like($$insert into public.project_feedback(studio_id,project_id,created_by,expires_at) values ('94000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000010',now()+interval '1 day')$$,'%project_feedback_project_id_studio_id_fkey%','composite FK blocks project/studio substitution');
set local role service_role;
select throws_like($$select public.submit_project_feedback(repeat('a',64),0,5,5,5,10,'','')$$,'%feedback_invalid_response%','server RPC rejects invalid rating');
select throws_like($$select public.submit_project_feedback(repeat('a',64),5,5,5,5,11,'','')$$,'%feedback_invalid_response%','server RPC rejects invalid NPS');
select throws_like($$select public.submit_project_feedback(repeat('a',64),null,5,5,5,10,'','')$$,'%feedback_invalid_response%','server RPC rejects missing rating');
select throws_like($$select public.submit_project_feedback(repeat('a',64),5,5,5,5,10,repeat('x',2001),'')$$,'%feedback_invalid_response%','server RPC bounds comment length');
select is(public.submit_project_feedback(repeat('e',64),5,5,5,5,10,'',''),false,'unknown token rejected');
select is(public.submit_project_feedback(repeat('b',64),5,5,5,5,10,'',''),false,'expired token rejected');
select is(public.submit_project_feedback(repeat('c',64),5,5,5,5,10,'',''),false,'revoked token rejected');
select is(public.submit_project_feedback(repeat('a',64),5,4,3,4,10,' Thoughtful team ',' Better timing '),true,'valid invitation accepts response');
select is(public.submit_project_feedback(repeat('a',64),3,4,5,4,6,'Second client',''),true,'same invitation accepts a separate second client response');
select is((select satisfaction::integer from public.project_feedback_responses r join public.project_feedback f on f.id=r.invitation_id where f.token=repeat('a',64) and r.strengths='Thoughtful team'),5,'first response preserved');
select is((select strengths from public.project_feedback_responses r join public.project_feedback f on f.id=r.invitation_id where f.token=repeat('a',64) and r.strengths='Thoughtful team'),'Thoughtful team','comments trimmed');
select is((select count(*)::int from public.project_feedback_responses),2,'two independent responses are stored');
select throws_like($$update public.project_feedback_responses set satisfaction=1$$,'%feedback_response_immutable%','submitted responses cannot be overwritten even by service role');
set local role authenticated;
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000010',true);
select is((select responses::integer from public.get_studio_feedback_summary('94000000-0000-0000-0000-000000000001') where period is null),2,'summary counts exactly two responses');
select is((select satisfaction from public.get_studio_feedback_summary('94000000-0000-0000-0000-000000000001') where period is null),4.00::numeric,'summary averages ratings');
select is((select nps from public.get_studio_feedback_summary('94000000-0000-0000-0000-000000000001') where period is null),0.0::numeric,'NPS promoters minus detractors');
select is((select count(*)::integer from public.get_studio_feedback_summary('94000000-0000-0000-0000-000000000001') where period is not null),1,'summary returns monthly trend');
select lives_ok($$select public.revoke_project_feedback((select id from public.project_feedback where token=repeat('a',64)))$$,'admin can revoke an invitation after responses');
select ok((select revoked_at is not null from public.project_feedback where token=repeat('a',64)),'answered invitation can be revoked');
select is((select count(*)::int from public.project_feedback_responses),2,'revocation preserves both responses');
select lives_ok($$select public.revoke_project_feedback((select id from public.project_feedback where token=repeat('f',64)))$$,'admin revokes pending invitation');
select ok((select revoked_at is not null from public.project_feedback where token=repeat('f',64)),'revocation stored');
set local role service_role;
select is(public.submit_project_feedback(repeat('f',64),5,5,5,5,10,'',''),false,'admin-revoked token cannot submit');
select is(public.submit_project_feedback(repeat('a',64),5,5,5,5,10,'',''),false,'revoking an answered invitation stops further responses');
set local role authenticated;
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000011',true);
select is((select count(*)::integer from public.project_feedback_responses),0,'employee cannot read actual stored responses');
select is((select responses::integer from public.get_studio_feedback_summary('94000000-0000-0000-0000-000000000001') where period is null),0,'employee cannot aggregate actual stored responses');
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000012',true);
select is((select count(*)::integer from public.project_feedback_responses),0,'foreign admin cannot read actual stored responses');
select throws_like($$select public.revoke_project_feedback((select id from public.project_feedback limit 1))$$,'%feedback_forbidden%','foreign admin cannot revoke another studio invitation');
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000010',true);

set local role postgres;
update public.profiles set is_active=false where id='94000000-0000-0000-0000-000000000010';
set local role authenticated;
select is((select count(*)::integer from public.project_feedback_responses),0,'inactive admin profile cannot read responses');
select throws_like($$select public.create_project_feedback('94000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'%feedback_forbidden%','inactive profile cannot create invitation');
set local role postgres;
update public.profiles set is_active=true where id='94000000-0000-0000-0000-000000000010';
update public.studio_members set is_active=false where user_id='94000000-0000-0000-0000-000000000010';
set local role authenticated;
select is((select count(*)::integer from public.project_feedback_responses),0,'inactive membership cannot read responses');
select throws_like($$select public.create_project_feedback('94000000-0000-0000-0000-000000000020',now()+interval '1 day')$$,'%feedback_forbidden%','inactive membership cannot create invitation');
select * from finish();
rollback;
