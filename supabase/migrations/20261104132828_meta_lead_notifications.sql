-- Existing inbox work and older application versions stay quiet during rollout.
alter table public.meta_lead_jobs add column notify_admins boolean not null default false;

-- Normalize only integration-owned labels with explicit provider attribution.
update public.crm_leads lead
set source = case job.payload->>'platform' when 'ig' then 'instagram' when 'fb' then 'facebook' end
from public.meta_lead_jobs job
where job.crm_lead_id=lead.id and job.studio_id=lead.studio_id
  and lead.source in ('Facebook Lead Ads','Meta Lead Ads')
  and job.payload->>'platform' in ('ig','fb');

create or replace function public.enqueue_meta_lead_jobs(p_page_id text,p_studio_id uuid,p_events jsonb,p_retry_failed boolean default false,p_manual boolean default false)
returns integer language plpgsql security invoker set search_path='' as $$
declare event jsonb; job public.meta_lead_jobs; form_enabled boolean; affected integer; inserted integer:=0; source_form text;
begin
  if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'invalid_meta_events'; end if;
  for event in select value from jsonb_array_elements(p_events) loop
    if event->>'leadgen_id' is null then raise exception 'invalid_meta_lead_id'; end if;
    -- Share the form lock with completion. A concurrent disable waits, then
    -- invalidates every pending/processing job before it commits.
    source_form:=coalesce(event->>'form_id',(select form_id from public.meta_lead_jobs where page_id=p_page_id and leadgen_id=event->>'leadgen_id' and studio_id=p_studio_id));
    form_enabled:=false;
    select sync_enabled into form_enabled from public.meta_lead_forms
      where page_id=p_page_id and studio_id=p_studio_id and form_id=source_form for share;
    form_enabled:=coalesce(form_enabled,false);
    if p_manual and not form_enabled then raise exception 'meta_form_not_enabled'; end if;
    insert into public.meta_lead_jobs(page_id,leadgen_id,studio_id,form_id,ad_id,submitted_at,status,last_error,notify_admins)
    values(p_page_id,event->>'leadgen_id',p_studio_id,source_form,event->>'ad_id',
      (event->>'submitted_at')::timestamptz,case when form_enabled then 'pending' else 'blocked' end,
      case when form_enabled then null else 'form_not_enabled' end,
      coalesce((event->>'notify_admins')::boolean,false))
    on conflict(page_id,leadgen_id) do nothing;
    get diagnostics affected=row_count;
    inserted:=inserted+affected;
    select * into job from public.meta_lead_jobs where page_id=p_page_id and leadgen_id=event->>'leadgen_id' for update;
    if job.studio_id is distinct from p_studio_id then raise exception 'meta_page_studio_mismatch'; end if;
    if job.form_id is not null and event->>'form_id' is not null and job.form_id<>event->>'form_id' then raise exception 'meta_form_mismatch'; end if;
    if job.status in ('completed','skipped') then continue; end if;
    -- A bulk retry can silence pending work; redelivery can never re-enable it.
    if event->>'notify_admins' = 'false' then
      update public.meta_lead_jobs set notify_admins=false
      where page_id=p_page_id and leadgen_id=job.leadgen_id;
    end if;
    if p_manual and (job.status='blocked' or (p_retry_failed and job.status='failed')) then
      update public.meta_lead_jobs set status='pending',form_id=coalesce(job.form_id,event->>'form_id'),
        attempts=0,available_at=now(),lease_token=null,locked_at=null,last_error=null
      where page_id=p_page_id and leadgen_id=job.leadgen_id;
    elsif not form_enabled and job.status in ('pending','processing') then
      update public.meta_lead_jobs set status='blocked',lease_token=null,locked_at=null,last_error='form_not_enabled'
      where page_id=p_page_id and leadgen_id=job.leadgen_id;
    end if;
  end loop;
  return inserted;
end;
$$;
revoke all on function public.enqueue_meta_lead_jobs(text,uuid,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.enqueue_meta_lead_jobs(text,uuid,jsonb,boolean,boolean) to service_role;

-- The existing completion RPC updates status in the same transaction as the
-- actual CRM insert. Failed writes, stale leases and redelivery never reach here.
create function private.notify_meta_lead_created()
returns trigger language plpgsql security definer set search_path='' as $$
declare lead public.crm_leads; recipient uuid;
begin
  if not new.notify_admins or new.crm_lead_id is null then return new; end if;
  select * into strict lead from public.crm_leads
    where id=new.crm_lead_id and studio_id=new.studio_id;
  for recipient in
    select member.user_id from public.studio_members member
    join public.profiles profile on profile.id=member.user_id and profile.is_active
    where member.studio_id=new.studio_id and member.is_active and member.system_role='admin'
  loop
    perform private.create_notification(
      'meta_lead_created',new.studio_id,recipient,null,
      'New lead from Meta','New client: ' || lead.client_name || '.',
      '/crm/leads?lead=' || lead.id,'crm_lead',lead.id,
      jsonb_build_object('leadName',lead.client_name,'source',lead.source)
    );
  end loop;
  return new;
end;
$$;
revoke all on function private.notify_meta_lead_created() from public,anon,authenticated,service_role;
create trigger notify_meta_lead_created after update of status on public.meta_lead_jobs
  for each row when (old.status is distinct from new.status and new.status='completed')
  execute function private.notify_meta_lead_created();

-- Being an active recipient is insufficient after losing CRM administrator access.
create policy notifications_crm_admin_read on public.notifications as restrictive
for select to authenticated
using (
  (entity_type is distinct from 'crm_lead' and notification_type not in ('crm_lead_follow_up','meta_lead_created'))
  or (select private.is_active_crm_admin(studio_id))
);

create or replace function private.notification_reminder_is_current(p_notification public.notifications)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_notification.notification_type in ('equipment_maintenance_upcoming', 'equipment_maintenance_overdue') then exists (
      select 1 from public.equipment e
      join public.studio_members m on m.studio_id = e.studio_id and m.user_id = p_notification.recipient_id
      join public.profiles p on p.id = m.user_id and p.is_active
      where p_notification.entity_type = 'equipment' and e.id = p_notification.entity_id
        and e.studio_id = p_notification.studio_id and e.recurring_maintenance_enabled
        and e.lifecycle_state <> 'retired'
        and e.next_maintenance_due_date::text = p_notification.metadata->>'dueDate'
        and m.is_active and m.system_role = 'admin'
        and (e.maintenance_responsible_id is null or e.maintenance_responsible_id = m.user_id)
        and not exists (
          select 1 from public.equipment_service_events s
          where s.equipment_id = e.id and s.event_type = 'regular_maintenance'
            and s.completed_on is not null and s.updated_at > p_notification.created_at
        )
    )
    when p_notification.notification_type in ('crm_lead_follow_up', 'meta_lead_created') then exists (
      select 1 from public.crm_leads l
      join public.studio_members m on m.studio_id = l.studio_id and m.user_id = p_notification.recipient_id
      join public.profiles p on p.id = m.user_id and p.is_active
      where p_notification.entity_type = 'crm_lead' and l.id = p_notification.entity_id
        and l.studio_id = p_notification.studio_id and m.is_active and m.system_role = 'admin'
        and (p_notification.notification_type = 'meta_lead_created' or (
          l.status <> 'invalid' and l.responsible_admin_id = p_notification.recipient_id
          and l.next_contact_at = (p_notification.metadata->>'contactAt')::timestamptz
        ))
    )
    else true
  end;
$$;
revoke all on function private.notification_reminder_is_current(public.notifications) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
