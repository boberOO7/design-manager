# Finance

Finance is a separate, studio-scoped management/cash-planning domain. V1 access
is administrator-only. Project lifecycle, CRM budgets, equipment/service costs,
Calendar salary reminders, and Leaderboard bonuses do not create Finance data.
`/finance` owns setup/accounts; `/finance/movements` owns actual cash and recorded
balances; `/finance/expected` owns expectations and matching; `/finance/categories`
owns classification. All inherit the same administrator-only layout and messages.

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
- New ordinary movements select a studio category; its direction/nature determine
  operating, financing/non-operating or owner-distribution semantics. Posted
  category names and nature are snapshots. Phase 2 free-text history is retained
  without rewriting old rows. Transfers retain their separate semantics. Owner
  distributions remain outside operating expenses and future P&L expenses.
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

## Categories, expectations and settlement

- `finance_categories` is a flat studio catalog seeded when settings are created,
  and backfilled for existing setups. Defaults cover project/supervision/contractor
  income, staff costs, ordinary expenses, financing and owner distributions. Default
  labels are localized; administrator names are stored as entered. Names can change;
  direction/nature cannot. Archive/restore preserves references and posted snapshots.
  Case/space-insensitive uniqueness prevents duplicate names within a direction/nature.
  A posting trigger requires an active category for new ordinary movements; refunds
  and reversals inherit the original snapshot, including legacy/archived categories.
- `finance_expected_items` holds incoming/outgoing amounts and currencies without
  creating account effects. Commitment (tentative/agreed/cancelled), certainty
  (fixed/estimated), contractual due date and expected payment date are independent.
  Explicit `is_established` means the studio is entitled to collect or obliged to pay;
  it requires agreed, fixed value. Agreed future contract value alone is not receivable.
  Cancellation clears established status but retains existing settlement history.
- `finance_expected_balances` derives settled/remaining, unpaid/partial/settled,
  due timing, and established outstanding amounts. Only positive outstanding
  incoming/outgoing balances enter receivable/obligation filters. An unpaid or partial
  item can also be overdue. Moving forecast timing never changes contractual due dates.
  Edits use optimistic versions; submitted revisions remain in the immutable planning
  request audit. Amount cannot fall below effective settlement. After allocation history
  exists, currency/direction/reporting nature are locked; descriptive/category edits
  within the same nature remain possible, including unchanged archived categories.
- `finance_allocations` is immutable signed matching history referencing original
  incoming/outgoing movement IDs and expected-item IDs through same-studio keys.
  Positive allocations support many-to-many and partial matching; negative releases
  reference a specific earlier allocation. No match or release creates money. Same
  currency, direction and nature are required. Transfers, fees, owner distributions
  and refunds are not independently allocatable payments in Phase 3.
- `finance_payment_availability` derives original principal less unreversed refunds
  (or zero after original reversal), less effective allocations. Excess incoming money
  remains unapplied credit; outgoing advances remain available for later obligations.
  Archived-account history remains matchable. Cancellation prevents new allocations.
- All matching writes take the same studio-settings lock as ledger posting. They
  validate both item remaining value and payment availability within that transaction.
  Request UUID/payload auditing makes retries idempotent and conflicting reuse fail.
  `record_finance_expected_payment` composes the existing cash RPC with allocation in
  one transaction; a failed match rolls back the cash posting too.
- A cash-entry trigger reconciles settlement when a refund or original reversal posts.
  Refunds consume unapplied availability first, then release the newest allocations
  until matching fits the remaining money. Releases link to the causing cash event.
  Reversing a refund restores **unapplied** availability; it does not resurrect old
  matches that may have been replaced. Administrators explicitly rematch that money.
  Manual unmatching also appends a reasoned release without altering the payment.

## Access and mutation boundary

`getActiveStudioAdmin()` resolves the verified actor through the canonical
membership resolver. `private.is_finance_admin()` also requires an active profile,
active admin membership, and exactly one active studio membership. It does not
consult the profile role mirror. This is intentionally stronger than the legacy
membership-only `private.is_studio_admin()` predicate.

All Finance tables have RLS and authenticated SELECT only. Guarded RPCs own
setup saves/finalization, accounts, categories, expected items, matching and cash corrections. They derive audit actors
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

Project Finance should generate/revise this same expected-item model, using explicit
established entitlement instead of treating the entire contract as receivable. Keep
due dates, forecast timing and actual payment dates distinct. Use stable studio/item
and studio/movement keys; do not create another cash store or bypass allocation locks.
Cross-currency settlement needs its own explicit conversion contract in a later phase;
historical ledger reporting FX must not be reused silently as settlement FX. Project,
payroll, recurring-expense and budget generation are not implemented here.

## Canonical sources

- `src/app/(app)/finance/`, `src/components/finance/finance-workspace.tsx`
- `src/data/queries/finance.ts`, `src/lib/finance.ts`
- `supabase/migrations/20260916200241_finance_foundation.sql`
- `supabase/tests/finance_foundation_rls.test.sql`
- `supabase/migrations/20260916221929_finance_actual_movements.sql`
- `supabase/tests/finance_movements_rls.test.sql`
- `src/lib/finance-movements.ts`, `src/lib/finance-fx.ts`
- `src/lib/finance-planning.ts`, `src/components/finance/expected-workspace.tsx`
- `supabase/migrations/20260916233308_finance_expected_settlement.sql`
- `supabase/tests/finance_settlement_rls.test.sql`
- Finance domain/action/migration tests and `tests/e2e/finance-foundation.spec.ts`
