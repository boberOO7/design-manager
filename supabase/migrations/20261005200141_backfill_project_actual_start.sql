-- One-time adoption of legacy practical start dates. Future lifecycle starts
-- and Statistics continue to use started_at without a planned-date fallback.
do $$
declare
  considered_count bigint;
  backfilled_count bigint;
  remaining_null_count bigint;
  contradictory_count bigint;
begin
  -- This administrative migration has no user identity. Temporarily bypass
  -- only the admin/lifecycle update guard, under ALTER TABLE's exclusive lock.
  -- The DO statement is atomic: a failure rolls back the trigger change too.
  -- Actual-date validation, the ordering constraint and system activity logging
  -- remain enabled; no lifecycle transition or completion side effect is replayed.
  alter table public.projects disable trigger validate_project_lifecycle_transition_before_update;

  select count(*), count(*) filter (
    where started_at is null and start_date > completed_at
  ) into considered_count, contradictory_count
  from public.projects;

  update public.projects
  set started_at = start_date
  where started_at is null
    and start_date is not null
    and start_date <= (now() at time zone 'Europe/Kyiv')::date
    and (status = 'archived') = (archived_at is not null)
    and (
      (status in ('active', 'paused') and completed_at is null)
      or (
        status in ('completed', 'archived')
        and completed_at is not null
        and completed_at <= (now() at time zone 'Europe/Kyiv')::date
        and start_date <= completed_at
      )
    );
  get diagnostics backfilled_count = row_count;

  alter table public.projects enable trigger validate_project_lifecycle_transition_before_update;

  select count(*) into remaining_null_count from public.projects where started_at is null;
  raise notice 'Project actual-start backfill: considered %, backfilled %, left NULL %, skipped contradictory start/completion %',
    considered_count, backfilled_count, remaining_null_count, contradictory_count;
end;
$$;
