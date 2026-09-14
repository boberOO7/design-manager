drop trigger sync_crm_lead_follow_up_notification_after_write on public.crm_leads;

create trigger sync_crm_lead_follow_up_notification_after_write
after insert or update of status, next_contact_at, responsible_admin_id, client_name or delete
on public.crm_leads
for each row execute function private.sync_crm_lead_follow_up_notification();
