insert into public.notifications (
  studio_id, recipient_id, actor_id, notification_type, title, body, href,
  entity_type, entity_id, metadata, created_at
)
select
  lead.studio_id, lead.responsible_admin_id, null, 'crm_lead_follow_up',
  'Lead follow-up reminder', 'Reminder: contact ' || lead.client_name || '.',
  '/crm/leads', 'crm_lead', lead.id,
  jsonb_build_object('leadName', lead.client_name, 'contactDate', lead.next_contact_date),
  (lead.next_contact_date::timestamp + time '09:00') at time zone 'Europe/Kyiv'
from public.crm_leads as lead
where lead.next_contact_date is not null
  and lead.responsible_admin_id is not null;
