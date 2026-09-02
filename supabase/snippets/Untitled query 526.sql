select
  source_event_id,
  studio_id,
  revision,
  status,
  attempts,
  available_at,
  locked_at,
  last_error,
  created_at,
  updated_at
from public.google_calendar_reconciliation_jobs
order by updated_at desc;