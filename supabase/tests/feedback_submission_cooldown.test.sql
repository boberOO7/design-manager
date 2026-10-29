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


insert into public.project_feedback(studio_id,project_id,created_by,expires_at,token) values
 ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000010',now()+interval '1 day',repeat('a',64)),
 ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000010',now()+interval '1 day',repeat('b',64)),
 ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000010',now()-interval '1 day',repeat('c',64));
create temp table answers as select '{"satisfaction":5,"communication":4,"timeliness":3,"expectations":5,"recommendation":10,"strengths":"Client response","improvements":""}'::jsonb as value;
grant select on answers to service_role,authenticated,anon;
set local role anon;
select throws_like($$select public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64))$$,'%permission denied%','anonymous cannot bypass the server source calculation');
select throws_like($$select * from private.feedback_submission_limits$$,'%permission denied%','anonymous cannot read rate limit metadata');
set local role authenticated;
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000010',true);
select throws_like($$select public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64))$$,'%permission denied%','even an admin cannot forge a source hash through the Data API');
select throws_like($$select * from private.feedback_submission_limits$$,'%permission denied%','studio administrators cannot read source hashes');
set local role service_role;
select throws_like($$select * from private.feedback_submission_limits$$,'%permission denied%','limit state is accessible only through guarded functions');
select throws_like($$select public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),'spoofed')$$,'%feedback_invalid_source%','source hashes are validated');
select throws_like($$select public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),null)$$,'%feedback_invalid_source%','a source hash is required');
select is(public.submit_feedback_with_cooldown(repeat('f',64),(select value from answers),repeat('1',64)),false,'unknown token cannot create rate limit rows');
select is(public.submit_feedback_with_cooldown(repeat('c',64),(select value from answers),repeat('1',64)),false,'expired token remains unavailable');
select throws_like($$select public.submit_feedback_with_cooldown(repeat('a',64),'{}',repeat('1',64))$$,'%feedback_invalid_response%','invalid answers cannot consume a burst place');
select ok(public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64)),'first response is accepted');
select throws_like($$select public.submit_feedback_with_cooldown(repeat('a',64),'{}',repeat('1',64))$$,'%feedback_invalid_response%','invalid answers after the first response do not consume the second place');
select ok(public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64)),'second response is accepted immediately');
select throws_like($$select public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64))$$,'%feedback_rate_limited%','third response is blocked');
select is((select count(*)::int from public.project_feedback_responses),2,'rate limited attempt stores no response');
select ok(public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('2',64)),'another network can submit during cooldown');
select ok(public.submit_feedback_with_cooldown(repeat('b',64),(select value from answers),repeat('1',64)),'another link has its own burst');
set local role postgres;
select is((select accepted_count::int from private.feedback_submission_limits where source_hash=repeat('1',64) and invitation_id=(select id from public.project_feedback where token=repeat('a',64))),2,'only accepted responses count');
select is((select count(*)::int from private.feedback_submission_limits),3,'one private row per invitation and source');
update private.feedback_submission_limits set requested_at=clock_timestamp()-interval '5 minutes'
 where source_hash=repeat('1',64) and invitation_id=(select id from public.project_feedback where token=repeat('a',64));
set local role service_role;
select ok(public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64)),'five minutes restores the first place');
select ok(public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64)),'five minutes restores the second place');
select throws_like($$select public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64))$$,'%feedback_rate_limited%','a fresh pair starts another cooldown');
set local role postgres;
create temp table before_denial as select requested_at from private.feedback_submission_limits where source_hash=repeat('1',64) and invitation_id=(select id from public.project_feedback where token=repeat('a',64));
grant select on before_denial to service_role;
set local role service_role;
select throws_like($$select public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64))$$,'%feedback_rate_limited%','repeated requests stay blocked');
set local role postgres;
select is((select requested_at from private.feedback_submission_limits where source_hash=repeat('1',64) and invitation_id=(select id from public.project_feedback where token=repeat('a',64))),(select requested_at from before_denial),'rejected requests do not extend the cooldown');
set local role authenticated;
select public.revoke_project_feedback((select id from public.project_feedback where token=repeat('a',64)));
set local role service_role;
select is(public.submit_feedback_with_cooldown(repeat('a',64),(select value from answers),repeat('1',64)),false,'revocation takes precedence over the cooldown');
select is((select count(*)::int from public.project_feedback_responses),6,'prior responses remain unchanged');
set local role postgres;
delete from public.project_feedback where token=repeat('a',64);
select is((select count(*)::int from private.feedback_submission_limits),1,'deleting an invitation removes its private buckets');
select * from finish();
rollback;
