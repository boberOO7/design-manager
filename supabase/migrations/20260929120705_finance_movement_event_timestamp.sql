-- Allocation history already uses clock_timestamp(); movement order must use
-- the same clock when several cash events occur in one transaction.
alter table public.finance_movements alter column created_at set default clock_timestamp();
