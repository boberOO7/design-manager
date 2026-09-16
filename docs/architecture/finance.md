# Finance

Finance is a separate, studio-scoped management/cash-planning domain. V1 access
is administrator-only. Project lifecycle, CRM budgets, equipment/service costs,
Calendar salary reminders, and Leaderboard bonuses do not create Finance data.
`/finance` owns setup/accounts; `/finance/movements` owns actual cash and recorded
balances. Both inherit the same administrator-only layout and Finance messages.

## Foundation and historical boundary

- One `finance_settings` row defines the studio's reporting currency and cutover
  date. Opening balances represent cash at the **beginning** of that date; they
  are neither revenue nor expense and are not transaction records.
- Setup starts as a draft. Administrators can correct settings and account
  currencies/openings until explicitly finalizing setup. Finalization records
  the actor/date, requires an active account, and cannot be undone through the API.
- After finalization, reporting currency, cutover date, and existing account
  currencies/openings are immutable. Later accounts start at zero. Renaming,
  archiving, and restoring remain available; restoring does not unlock openings.
- An account represents one independent cash pool/currency pocket. A card using
  an existing balance does not create another pool. Archived accounts and their
  openings remain historical data; archival never removes balances.
- Accounts have a `(studio_id, id)` unique key for future tenant-safe references.
  There is no client delete path; foreign keys restrict destructive parent deletion.
- `finance_currencies` is an ISO 4217 reference snapshot with monetary minor units,
  extended through migrations. It includes currencies beyond CRM's four choices.
  Opening amounts use exact PostgreSQL numeric, reject excess currency precision
  instead of rounding, and support negative/zero balances. The current input range
  is ten integer digits and up to four fractional digits. Monetary arithmetic and
  reporting-valuation rounding happen in PostgreSQL, never in the client.

## Actual cash and historical valuation

- `finance_movements` is the immutable event header; `finance_movement_entries`
  holds its signed account effects. A single guarded RPC creates the whole event.
  Ordinary incoming/outgoing movements and owner distributions have one primary
  entry. Transfers have source and destination entries and an optional fee entry.
- Recorded balance is opening balance plus **all** signed entries, including
  corrections and archived-account history. `finance_account_balances` derives it;
  there is no mutable balance cache. `finance_cash_effects` exposes classification
  for later reporting and never contains opening balances. Both views use
  `security_invoker=true` and preserve underlying RLS.
- Every new movement requires finalized setup and an actual financial date from
  cutover through today in `Europe/Kyiv`. New postings reject archived accounts.
  The `(studio_id, account_id, currency)` and studio/reporting-currency references
  also prevent foreign-account links or mismatched snapshot currencies.
- Classification is independent of a free-text user category: operating,
  financing/non-operating, owner distribution, or transfer. Owner distributions
  must remain outside operating expenses and future P&L expenses.
- Transfer principal is never income/expense. Same-currency principal amounts
  must match. Cross-currency transfers preserve both actual amounts; their ratio
  records the realized conversion facts independently of reporting FX. A fee is
  additional to principal, charged to the source account in its currency, and
  classified separately as operating. A fee charged elsewhere is a separate
  outgoing movement. Reporting differences between transfer legs stay transfers;
  no operating exchange gain/loss is manufactured.
- Each entry stores its account currency, reporting currency, exact rate,
  rounded reporting amount, source and effective date. Rates are reporting units
  per **one** account-currency unit, with up to ten decimal places. Matching
  currencies use explicit identity valuation. Foreign currencies require manual
  valuation or, for UAH reporting, the NBU rate effective for the financial date.
  The server uses NBU's dated range endpoint and `rate_per_unit`, checking the
  returned currency and `exchangedate` exactly. Missing, ambiguous, or mismatched
  results fail closed; an administrator must explicitly choose a manual rate.
  NBU snapshots are fetched by the app; direct authorized RPC input remains
  administrator-supplied valuation data, not a bank-certified rate.
- Movement and entry updates/deletes are blocked by both grants and immutable
  history triggers. Corrections use an explicit, reasoned reversal event followed
  by a replacement if needed. A reversal copies and negates every original entry,
  including fees and reporting valuations, and can refer to archived accounts.
  Only one reversal per original is allowed; reversals cannot be reversed.
- An actual refund is different from correcting a recording mistake. It links to
  an incoming/outgoing original, uses the same account, carries the opposite cash
  direction, and uses the refund date's valuation. Partial refunds are allowed;
  their unreversed total cannot exceed original principal. Refund entries must be
  reversed before reversing their original. Dates cannot precede the original.
  The refund link remains necessary for future contra-revenue/expense reporting.
- Studio/request UUID uniqueness and the Phase 1 parent-row lock serialize
  retries, refunds, reversals and archival. Identical retries return the event ID;
  changed payloads conflict. The form retains its request ID across errors. The
  action checks a previously stored submission before another FX lookup, so a lost
  response can be retried during an outage without creating another movement.

## Access and mutation boundary

`getActiveStudioAdmin()` resolves the verified actor through the canonical
membership resolver. `private.is_finance_admin()` also requires an active profile,
active admin membership, and exactly one active studio membership. It does not
consult the profile role mirror. This is intentionally stronger than the legacy
membership-only `private.is_studio_admin()` predicate.

All Finance tables have RLS and authenticated SELECT only. Guarded RPCs own
setup saves/finalization, account saves, archival, movement posting and reversal. They derive audit actors
from `auth.uid()` and verify the supplied studio. Private helpers have restricted
execution and empty search paths. Account mutations lock the setup row before
writing, serializing them with settings changes/finalization; triggers enforce
identity and historical invariants. Finance emits no ordinary project activity
or notifications containing private data.

## Next-phase constraints

Actual movements must require finalized setup and retain account-currency amounts;
reporting valuations must preserve their currency/rate/date independently. Do not
derive historical valuations from mutable settings or sum mixed currencies.
Opening positions remain separate from period cash flow. Transfers and corrections
must not be implemented by rewriting finalized opening balances. Financial reports
must retain archived accounts when reporting their history. A reporting-currency
change would require an explicit later migration/workflow, not a settings edit.

Expected items and allocations must reference this ledger instead of creating a
second actual-cash store. Link through stable studio/event keys and distinguish
principal from transfer fees. Settlement must account for refunds and reversals;
it must never delete or mutate their historical entries. The current ledger has
no expected-item, payroll, project-payment or budget generation behavior.

## Canonical sources

- `src/app/(app)/finance/`, `src/components/finance/finance-workspace.tsx`
- `src/data/queries/finance.ts`, `src/lib/finance.ts`
- `supabase/migrations/20260916200241_finance_foundation.sql`
- `supabase/tests/finance_foundation_rls.test.sql`
- `supabase/migrations/20260916221929_finance_actual_movements.sql`
- `supabase/tests/finance_movements_rls.test.sql`
- `src/lib/finance-movements.ts`, `src/lib/finance-fx.ts`
- Finance domain/action/migration tests and `tests/e2e/finance-foundation.spec.ts`
