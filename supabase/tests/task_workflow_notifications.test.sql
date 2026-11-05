begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

-- All notification/push work rolls back with this fixture; no provider is called.
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('ad000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.actor(n integer) returns void language sql as $$
  select set_config('request.jwt.claim.sub',pg_temp.id(n)::text,true);
$$;
create function pg_temp.notices(kind text, recipient integer, correction uuid default null) returns bigint
language sql security definer set search_path='' as $$
  select count(*) from public.notifications where studio_id=pg_temp.id(1)
    and notification_type::text=kind and recipient_id=pg_temp.id(recipient)
    and (correction is null or metadata->>'correctionId'=correction::text);
$$;
create function pg_temp.round_id() returns uuid language sql as $$
  select id from public.task_review_rounds where task_id=pg_temp.id(30) and completed_at is null;
$$;
insert into public.studios(id,name) values(pg_temp.id(1),'Workflow notifications');
insert into auth.users(id,email) select pg_temp.id(n),'notification-'||n||'@example.test' from generate_series(10,14) n;
insert into public.profiles(id,email,full_name,system_role)
  select pg_temp.id(n),'notification-'||n||'@example.test','Member '||n,case when n=10 then 'admin' else 'employee' end from generate_series(10,14) n;
insert into public.studio_members(studio_id,user_id,system_role)
  select pg_temp.id(1),pg_temp.id(n),case when n=10 then 'admin' else 'employee' end from generate_series(10,14) n;
insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by)
  values(pg_temp.id(20),pg_temp.id(1),'Review project',0,'active',current_date,pg_temp.id(10));
insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
  select pg_temp.id(20),pg_temp.id(n),'designer',0,current_date from unnest(array[11,12,14]) n;
insert into public.tasks(id,project_id,title,stage,status,assignee_id,created_by) values
  (pg_temp.id(30),pg_temp.id(20),'Review task','stage_1','in_progress',pg_temp.id(11),pg_temp.id(10)),
  (pg_temp.id(31),pg_temp.id(20),'Keeps production open','stage_2','in_progress',pg_temp.id(11),pg_temp.id(10));
insert into public.task_collaborators(task_id,user_id) values(pg_temp.id(30),pg_temp.id(12));
insert into auth.sessions(id,user_id) select pg_temp.id(100+n),pg_temp.id(n) from unnest(array[10,11,12,14]) n;
insert into public.web_push_subscriptions(user_id,session_id,endpoint,p256dh,auth,vapid_public_key)
  select pg_temp.id(n),pg_temp.id(100+n),'https://fcm.googleapis.com/fcm/send/workflow-'||n,repeat('A',87),repeat('B',22),repeat('C',87)
  from unnest(array[10,11,12,14]) n;

set local role authenticated;
select pg_temp.actor(10);
select public.update_task_review(pg_temp.id(30),'configure',p_reviewer_ids=>array[pg_temp.id(12),pg_temp.id(10)]);
select pg_temp.actor(11);
select public.update_task_review(pg_temp.id(30),'submit');
select is(pg_temp.notices('task_review_requested',12),1::bigint,'first reviewer receives the submission');
select pg_temp.actor(12);
select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(12));
select is(pg_temp.notices('task_review_approved',11),1::bigint,'executor hears about intermediate approval');
select is(pg_temp.notices('task_review_approved',12),0::bigint,'collaborator who approved gets no self notification');
select is(pg_temp.notices('task_review_requested',10),1::bigint,'next reviewer receives a handoff');
select throws_ok($$select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(12))$$,'P0001',null,'stale approval is rejected');
select is(pg_temp.notices('task_review_approved',11),1::bigint,'stale approval does not duplicate notification');
select pg_temp.actor(10);
select public.update_task_review(pg_temp.id(30),'rework',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(10),p_comment=>'Fix dimensions');
select is(pg_temp.notices('task_rework_requested',11),1::bigint,'review return notifies executor exactly once');
select is(pg_temp.notices('task_rework_requested',12),1::bigint,'review return also notifies collaborator');
select pg_temp.actor(11);
select is((select metadata->>'comment' from public.notifications where notification_type='task_rework_requested' and entity_id=pg_temp.id(30)),'Fix dimensions','return preserves review context');
select is((select href from public.notifications where notification_type='task_rework_requested' and entity_id=pg_temp.id(30)),'/projects/'||pg_temp.id(20)||'?task='||pg_temp.id(30),'return opens the exact task');
update public.notifications set read_at=now() where notification_type='task_rework_requested' and entity_id=pg_temp.id(30);
select public.update_task_review(pg_temp.id(30),'submit');
select is(pg_temp.notices('task_review_requested',12),2::bigint,'resubmission sends a new request');
select pg_temp.actor(12);
select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(12));
select pg_temp.actor(10);
select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(10));
select is(pg_temp.notices('task_review_approved',11),3::bigint,'repeat intermediate and final approval are distinct');
select pg_temp.actor(11);
select is((select count(*) from public.notifications where notification_type='task_review_approved' and entity_id=pg_temp.id(30) and metadata @> '{"isFinal":true,"roundNumber":2}'),1::bigint,'final approval carries the new round');
select pg_temp.actor(10);
update public.tasks set status='in_progress' where id=pg_temp.id(30);
select is(pg_temp.notices('task_rework_requested',11),2::bigint,'client-review return is delivered after prior return was read');
select pg_temp.actor(11);
select public.update_task_review(pg_temp.id(30),'submit');
select pg_temp.actor(12);
select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(12));
select pg_temp.actor(10);
select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(10));
select is(pg_temp.notices('task_review_approved',11),5::bigint,'a third review is not suppressed by earlier approvals');
update public.tasks set status='completed' where id=pg_temp.id(30);
update public.tasks set status='completed' where id=pg_temp.id(30);
select is(pg_temp.notices('task_completed',11),1::bigint,'client completion sends once, unchanged status sends nothing');
select is(pg_temp.notices('task_completed',12),1::bigint,'completion reaches the collaborator');

-- A correction has its own executor, not the primary task's assignment.
select public.update_task_correction(pg_temp.id(30),'create',p_description=>'Fix layout',p_assignee_id=>pg_temp.id(14),p_reviewer_ids=>array[pg_temp.id(12),pg_temp.id(10)]);
select is(pg_temp.notices('task_assigned',14),1::bigint,'correction creation assigns its executor');
select public.update_task_correction(pg_temp.id(30),'update',p_correction_id=>(select id from public.task_corrections where task_id=pg_temp.id(30)),p_description=>'Fix dimensions',p_assignee_id=>pg_temp.id(14));
select is(pg_temp.notices('task_assigned',14),1::bigint,'editing correction text does not repeat assignment');
select pg_temp.actor(14);
select is((select metadata->>'subject' from public.notifications where notification_type='task_assigned' and entity_id=pg_temp.id(30)),
  'Review task','correction assignment preview exposes task title, not private work instructions');
select public.update_task_correction(pg_temp.id(30),'submit',p_correction_id=>(select id from public.task_corrections where task_id=pg_temp.id(30)));
select pg_temp.actor(12);
select is((select count(*) from public.notifications where notification_type='task_review_requested' and metadata ? 'correctionId' and entity_id=pg_temp.id(30)),1::bigint,'review request identifies correction context');
select public.update_task_review(pg_temp.id(30),'rework',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(12),p_comment=>'Fix correction');
select is(pg_temp.notices('task_rework_requested',14),1::bigint,'correction reviewer return reaches its executor');
select is(pg_temp.notices('task_rework_requested',11),2::bigint,'correction does not notify unrelated primary executor');
select is(pg_temp.notices('task_assigned',14),1::bigint,'review return is not mislabelled as assignment');
select pg_temp.actor(14);
select public.update_task_correction(pg_temp.id(30),'submit',p_correction_id=>(select id from public.task_corrections where task_id=pg_temp.id(30)));
select pg_temp.actor(12);
select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(12));
select pg_temp.actor(10);
select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(10));
select is(pg_temp.notices('task_review_approved',14),2::bigint,'both correction approval steps reach its executor');
select public.update_task_correction(pg_temp.id(30),'resume',p_correction_id=>(select id from public.task_corrections where task_id=pg_temp.id(30)));
select is(pg_temp.notices('task_rework_requested',14),2::bigint,'client return of correction reaches its executor');
select pg_temp.actor(14);
select public.update_task_correction(pg_temp.id(30),'submit',p_correction_id=>(select id from public.task_corrections where task_id=pg_temp.id(30)));
select pg_temp.actor(12);
select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(12));
select pg_temp.actor(10);
select public.update_task_review(pg_temp.id(30),'approved',p_round_id=>pg_temp.round_id(),p_expected_reviewer_id=>pg_temp.id(10));
select public.update_task_correction(pg_temp.id(30),'complete',p_correction_id=>(select id from public.task_corrections where task_id=pg_temp.id(30)));
select is(pg_temp.notices('task_review_approved',14),4::bigint,'repeated correction approvals all reach executor');
select is(pg_temp.notices('task_completed',14),1::bigint,'correction completion reaches executor');
select is(pg_temp.notices('task_assigned',14),1::bigint,'correction lifecycle never repeats assignment');
select is((select status::text from public.tasks where id=pg_temp.id(30)),'completed','original task completion remains untouched');
select public.update_task_correction(pg_temp.id(30),'create',p_description=>'Next cycle',p_assignee_id=>pg_temp.id(14),p_reviewer_ids=>array[pg_temp.id(10)]);
select public.update_task_correction(pg_temp.id(30),'update',p_correction_id=>(select id from public.task_corrections where task_id=pg_temp.id(30) and status='in_progress'),p_description=>'Next cycle',p_assignee_id=>pg_temp.id(12));
select is(pg_temp.notices('task_assigned',12),2::bigint,'changing correction executor still sends a real assignment');

-- Authorization, atomic rollback and inactive-recipient filtering.
select pg_temp.actor(13);
select is((select count(*) from public.notifications where entity_id=pg_temp.id(30)),0::bigint,'outsider cannot read task outcomes');
select throws_ok($$select private.notify_task_workflow(pg_temp.id(30),'task_completed','{}')$$,'42501',null,'clients cannot forge outcome notifications');
select pg_temp.actor(10);
select public.update_task_review(pg_temp.id(31),'configure',p_reviewer_ids=>array[pg_temp.id(12)]);
select pg_temp.actor(11);
select public.update_task_review(pg_temp.id(31),'submit');
select pg_temp.actor(12);
-- An exception after an approval must roll back both the step and notification.
select throws_ok($$do $test$ begin
  perform public.update_task_review(pg_temp.id(31),'approved',p_round_id=>(select id from public.task_review_rounds where task_id=pg_temp.id(31) and completed_at is null));
  raise exception 'Rollback this decision';
end $test$;$$,'P0001','Rollback this decision','failed enclosing transaction rolls back approval');
select is(pg_temp.notices('task_review_approved',11),5::bigint,'rolled-back approval leaves no notification');
reset role;
update public.profiles set is_active=false where id=pg_temp.id(11);
set local role authenticated;
select public.update_task_review(pg_temp.id(31),'approved',p_round_id=>(select id from public.task_review_rounds where task_id=pg_temp.id(31) and completed_at is null));
select is(pg_temp.notices('task_review_approved',11),5::bigint,'inactive executor receives no outcome');
reset role;
insert into public.task_collaborators(task_id,user_id) values(pg_temp.id(31),pg_temp.id(12));
update public.project_members set is_active=false where project_id=pg_temp.id(20) and user_id=pg_temp.id(12);
set local role authenticated;
select pg_temp.actor(10);
update public.tasks set status='in_progress' where id=pg_temp.id(31);
select is(pg_temp.notices('task_rework_requested',12),2::bigint,'revoked project access blocks outcomes even when collaborator record remains');
reset role;
insert into public.tasks(id,project_id,title,stage,status,assignee_id,created_by)
  values(pg_temp.id(32),pg_temp.id(20),'Manual review','stage_3','in_progress',pg_temp.id(14),pg_temp.id(10));
set local role authenticated;
update public.tasks set status='internal_review' where id=pg_temp.id(32);
update public.tasks set status='in_progress' where id=pg_temp.id(32);
select is(pg_temp.notices('task_rework_requested',14),3::bigint,'manual internal-review return also notifies executor');
update public.tasks set status='internal_review' where id=pg_temp.id(32);
update public.tasks set status='review' where id=pg_temp.id(32);
select is(pg_temp.notices('task_review_approved',14),5::bigint,'approval without a configured reviewer round is delivered');
update public.tasks set status='todo' where id=pg_temp.id(32);
select is(pg_temp.notices('task_rework_requested',14),4::bigint,'returning client review to the backlog also reaches executor');
reset role;
select is((select count(*) from public.notifications n join public.web_push_subscriptions s on s.user_id=n.recipient_id
  left join public.web_push_deliveries d on d.notification_id=n.id and d.subscription_id=s.id
  where n.studio_id=pg_temp.id(1) and n.notification_type in ('task_review_requested','task_review_approved','task_rework_requested','task_completed') and d.id is null),
  0::bigint,'every workflow event queues a system push for each opted-in device');
select is((select count(*) from (select d.notification_id,d.subscription_id from public.web_push_deliveries d
  join public.notifications n on n.id=d.notification_id where n.studio_id=pg_temp.id(1) group by 1,2 having count(*)<>1) duplicates),
  0::bigint,'system deliveries are unique per notification and subscription');
select * from finish();
rollback;
