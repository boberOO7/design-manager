# Finance

Finance is a separate, studio-scoped management/cash-planning domain. V1 access
is administrator-only. Project lifecycle, CRM budgets, equipment/service costs,
Calendar salary reminders, and Leaderboard bonuses do not create Finance data.
`/finance` owns the management Overview; `/finance/accounts` owns setup/accounts; `/finance/movements` owns actual cash and recorded
balances; `/finance/expected` owns expectations and matching; `/finance/categories`
owns classification; `/finance/schedules` owns compensation and recurring rules;
`/finance/planning` owns cash budgets, rolling forecasts and saved expectations. All inherit the same administrator-only layout and messages.
Project details adds an administrator-only `view=finance` tab with its own scoped
Finance messages; it uses these same expectations, movements, and matching RPCs.

## Foundation and historical boundary

- One `finance_settings` row defines the studio's reporting currency and cutover
  date. Opening balances represent cash at the **beginning** of that date; they
  are neither revenue nor expense and are not transaction records.
- Setup starts as a draft. Administrators can correct settings and account
  currencies/openings until explicitly finalizing setup. Finalization records
  the actor/date, requires an active account, and cannot be undone through the API.
  Draft cutover dates may be in the future, but finalization requires cutover on
  or before today's `Europe/Kyiv` business date. A database trigger also protects
  direct finalized inserts/updates; the requested date is never silently changed.
  If legacy future-finalized state is found, preserve its history and wait until
  cutover before using current-cash reports. An incorrectly recorded date requires
  a separately reviewed repair; ordinary setup APIs never unlock finalized history.
- After finalization, reporting currency, cutover date, and existing account
  currencies/openings are immutable. Later accounts start at zero. Renaming,
  archiving, and restoring remain available; restoring does not unlock openings.
- An account represents one independent cash pool/currency pocket. A card using
  an existing balance does not create another pool. Archived accounts and their
  openings remain historical data; archival never removes balances.
- Accounts have a `(studio_id, id)` unique key for future tenant-safe references.
  There is no client delete path; foreign keys restrict destructive parent deletion.
- Account creation requires a request UUID, retained for the create form's lifetime
  and renewed for each new Add account flow. `save_finance_account` uses the existing
  studio lock and immutable `finance_planning_requests` audit. Identical retries,
  including concurrent or lost-response retries, return the original account ID;
  changed payloads conflict. Recovery still works after finalization, valuation,
  rename or archival and never resets those fields. Separate request IDs allow
  legitimately identical accounts. Existing-account edits retain their usual guards.
- `finance_currencies` is an ISO 4217 reference snapshot with monetary minor units,
  extended through migrations. It includes currencies beyond CRM's four choices.
  Opening amounts use exact PostgreSQL numeric, reject excess currency precision
  instead of rounding, and support negative/zero balances. The current input range
  is ten integer digits and up to four fractional digits. Monetary arithmetic and
  reporting-valuation rounding happen in PostgreSQL, never in the client.

## Historical opening valuation

- Nonzero foreign openings carry a reporting amount, FX rate/source/effective date,
  and valuation actor/time on `finance_accounts`. The reporting currency and
  financial date are the studio's cutover context. Rates follow Phase 2: reporting
  units per one account-currency unit, dated NBU for UAH or explicit manual input,
  with exact numeric rounding once to reporting-currency precision.
- Accounts provides an explicit valuation action using the same historical FX
  resolver as movements. NBU requests use the cutover date, never today. Missing
  rates save nothing and require retry or an explicit manual fallback. Same-currency
  openings use their original amount; zero foreign openings require no assumed rate.
- Draft valuations may be corrected. Changing the opening amount, account currency,
  reporting currency or cutover clears stale draft valuations. Finalization requires
  all nonzero foreign openings to be valued, including archived accounts. Context
  checks under the Finance parent lock reject stale submissions.
- Older finalized setups retain missing valuations until an admin explicitly
  completes them. This exception only fills absent valuation fields; it never
  unlocks amounts, currencies or cutover. Once completed on a finalized setup,
  valuation and provenance are immutable, including against direct privileged edits.
- Valuation creates no ledger entries, cash activity or expected items. Native
  account balances retain original opening amounts. Historical consolidated cash
  sums frozen opening valuations and each movement's own stored reporting value.
  Current balances and rolling Forecast still use report-date FX independently.

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
  direction/nature cannot. Unused custom categories may be deleted; referenced custom
  categories and all system/default categories archive instead. Archive/restore
  preserves references and posted snapshots.
  UI labels use the stable `default_key` only while a category retains its system
  name. Renamed/custom categories display exactly as stored. Structured movement
  history localizes that system identity; legacy rows with no `category_id` display
  their original free-text snapshot unchanged.
  Case/space-insensitive uniqueness prevents duplicate names within a direction/nature.
  A posting trigger requires an active category for new ordinary movements; refunds
  and reversals inherit the original snapshot, including legacy/archived categories.
- Categories required by active or future schedule terms cannot be archived,
  including payroll's implicit employer-cost/remittance category and terms beyond
  the forecast horizon. Unknown payroll costs retain that dependency. New payroll
  terms reject an archived required cost category with a restoration instruction;
  restoring a legacy archived dependency allows occurrence maintenance to recover.
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
  currency, direction and nature are required. Owner withdrawals are allocatable
  as outgoing owner distributions; they cannot settle operating expenses. Transfers,
  fees and refunds are not independently allocatable payments.
- `finance_payment_availability` derives original principal less unreversed refunds
  (or zero after original reversal), less effective allocations. It stays broad so
  any compatible historical incoming/outgoing movement can be matched, including an
  ordinary standalone transaction. `finance_actionable_unapplied` is the narrower
  attention surface: it contains positive availability explicitly posted as an
  advance/prepayment or with allocation history. Contextual overpayments and released
  matches therefore remain visible, while ordinary unallocated rent, utilities or
  standalone income do not imply unfinished work. Archived-account history remains
  matchable. Cancellation prevents new allocations.
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

## Project agreements and revenue streams

- `finance_project_terms` retains immutable, numbered design/supervision revisions
  with the actor and a required agreement/amendment note. Current terms are the
  latest revision, not a copied CRM budget. Saves use the existing studio lock,
  request audit/idempotency, and optimistic revision checks.
- `finance_project_items` adds permanent project/source context to Phase 3 expected
  items. It contains no separate payment or settlement state. Design, supervision,
  contractor bonus, and other income use incoming Finance expectations. Project
  payment recording composes the existing ledger/allocation RPC and returns to
  the originating project; global matching sees the same expected and movement IDs.
- Design schedules have arbitrary names/counts, independent due/expected dates,
  and the agreement currency. Active scheduled amounts cannot exceed the current
  contract. A shortfall stays **unscheduled**, with no invented forecast date.
  Currency is fixed after any schedule history. An amendment never edits the
  schedule; administrators revise unpaid items explicitly, with submitted revisions
  retained in the planning audit. After any allocation history, project-item amount,
  currency, category, due date and certainty are locked even through the global RPC.
  Expected timing, description and established status remain editable.
- Project expectation cancellation uses `cancel_finance_project_expectation`, with
  a required reason, item version and effective-settlement check under the studio
  lock. Refunds alone never cancel an expectation. With no retained settlement,
  cancellation preserves the original amount, terms, payment and allocation history.
  With retained settlement, explicit confirmation atomically releases its matches,
  cancels the original and re-matches that exact amount to a fully paid replacement
  in the same project/stream/currency. Releases and the original-to-replacement audit
  are append-only; neither path changes cash. Cancelled items cannot be reopened.
  The original permanently retains visit/month billing identity. Closed unpaid value
  leaves receivables and timed forecasts; the commercial agreement total stays intact
  and its unscheduled remainder still requires a separate explicit agreement amendment.
- `finance_project_totals` uses exact database numeric, grouped by stream/currency.
  Collected is effective allocated money (net of releases), not all cash on a
  receipt that happens to partly settle the project. Excess remains a global
  actionable credit. Planned is active remaining value not established as receivable; the
  contract's unscheduled remainder is shown separately. Opening balances never enter
  these totals. Future project due dates do not infer established entitlement in
  the form; existing stored entitlement is preserved when editing.
- Monthly supervision is a full-calendar-month rate with an effective start and
  optional inclusive end, not a finite lifetime contract. An explicit admin action
  generates at most 12 months per batch, with month-end due/expected dates and
  established status false. Stable project/month uniqueness skips already generated
  months across retries and revisions, including cancelled occurrences. No background
  billing or catch-up job runs. New supervision revisions start after generated
  months; existing expected items are never rewritten or automatically cancelled.
- Per-visit charges require selection of an existing, non-cancelled same-project
  Calendar site visit and an explicit save. Calendar already requires site visits
  to be concrete, non-recurring events. Applicable terms are selected for the
  visit's Kyiv date, including historical revisions. The form defaults amount and
  currency to that revision and identifies manual pricing through an explicit override
  control. An override survives visit selection changes. Contract-default submissions
  verify the applicable revision and price again at save; manual prices retain their
  applicable agreement link and request audit. Monthly-retainer visits still need
  explicit extra-charge confirmation and deliberately entered amount and currency;
  unrelated current per-visit terms never seed a historical retainer extra. Explicit
  manual prices survive visit selection changes.
  One permanent charge identity per visit prevents duplicate billing. Custom/manual
  supervision expectations remain available. Changing or stopping supervision is
  an explicit effective-dated revision, independent of project status.
- Contractor bonuses are income to the studio. They default to tentative and can
  reference an existing contractor; studio ownership is verified through its category.
  Contractor names and visit titles/dates are snapshotted in private Finance context.
  Foreign keys restrict deletion of referenced projects, contractors and visits;
  billed visits cannot change studio, project or event type. Operational rename,
  rescheduling, cancellation, completion, pause and archive never rewrite Finance.
- All project Finance tables and caller-context views use the existing strict
  Finance admin boundary. Employees get no tab/data and direct `view=finance` is
  denied. Private terms and amendments do not enter project activity/notifications.

## Employee compensation and recurring studio obligations

- `/finance/schedules` is admin-only. `finance_schedules` identifies either an
  employee's monthly payroll or a recurring studio obligation; immutable
  `finance_schedule_terms` holds numbered, effective-dated revisions. Starts are
  month starts and optional inclusive ends are month ends. Later revisions must
  start in a future month and cannot split an existing multi-month service period.
  The first payroll form suggests the employee's current Team start month when
  available; the saved term is independent and later Team edits do not change it.
  History derives valid-through from the next revision, submitted end and permanent
  stop boundary.
- Payroll keeps agreed compensation (net/gross), employee payout, optional
  employee deductions/remittances and additional employer cost separate. Admins
  supply amounts; PostgreSQL validates exact currency precision and agreement
  arithmetic. Net equals payout, with remittances additional; gross equals payout
  plus explicit deductions. Unknown costs remain null, confirmed zero is explicit,
  and estimated employer cost remains estimated. There is no statutory tax engine.
- Net-pay forms accept additional remittances: blank is unknown, zero explicitly
  confirms none, and a known amount is additional to payout. Gross arithmetic is
  unchanged. Employer costs retain fixed/estimated choices.
- Expected payroll items expose completion of originally unknown remittances and
  employer costs for past service months or earned/allocated payouts. The guarded
  `complete_finance_payroll_cost` RPC appends reasoned, versioned facts to
  `finance_payroll_cost_revisions`; retries use the existing planning request audit.
  Positive amounts create/revise the separate expected component, while explicit
  zero or unknown cancels an unsettled component without inventing a zero payment.
  Established components and any allocation history prohibit further completion
  edits. The global editor cannot bypass these audited amount/state corrections.
  Salary terms, payouts and cash remain unchanged; automatic maintenance preserves
  completed occurrences. Compensation amendments cannot overlap completed occurrences,
  even if the payout's earned flag is later cleared. Forecast diagnostics read the latest explicit
  completion state, and estimated expectations retain existing forecast semantics.
- Recurring studio terms select any outgoing category, monthly/quarterly/yearly
  cadence, fixed/estimated value and tentative/agreed commitment. The category's
  immutable nature keeps owner distributions non-operating. Each interval starts
  from the revision's effective month. Paydays clamp to month-end; a payment may
  fall in the period's start month or the next month.
- Saving a rule maintains expected occurrences from the current planning boundary
  through the twelve-month horizon. Finance planning, Forecast and administrator
  Calendar reads reconcile the requested supported horizon before reading it.
  `finance_obligations` is permanent employee/service-period/source context, and
  `finance_obligation_items` links its components to ordinary expected items.
  Schedule/month and employee/payroll-month uniqueness prevent duplicates across
  retries, revisions and cancellations. No new cash or settlement store exists.
  Each component supports the existing partial allocation, correction and reversal
  flow. Expected items initially have `is_established=false`; admins explicitly
  confirm earned obligations. Maintenance does not mean earning or payment. The
  guarded generation RPC remains available for exceptional historical backfill,
  but is not exposed in the normal schedule workflow.
- Payroll payout, remittance and bonus amounts and contractual dates are protected
  even through the global editor. Expected timing, description, cancellation and
  earned status remain editable. Studio and employer-cost estimates can be
  explicitly reconciled through the existing audited expected-item editor.
  Generated components show their employee and service period in Expected items.
- Team removal and profile deactivation permanently stop the old payroll schedule
  from the next service month, atomically with deactivation. Past ungenerated
  months can still be backfilled; created obligations and settlement history survive.
  Untouched future projections are cancelled from the stop boundary.
  Restoration never restarts pay; a new schedule must begin after the prior stop
  and can reuse system-cancelled employee/month identities. Membership-first locks
  coordinate payroll generation with Team removal, followed by the existing Finance lock.
- Cancellation requires schedule ownership. A replacement may adopt an unprotected,
  system-cancelled occurrence only with valid replacement terms and a stopped prior
  owner. The same obligation and component IDs acquire explicit replacement ownership;
  predecessor maintenance cannot cancel them, regardless of processing order.
- Rates apply to whole months, with no automatic proration for joining/leaving or
  partial recurring intervals. Admins must explicitly reconcile partial-period
  obligations before marking them earned. A one-off employee bonus is a separate
  admin-authored payout and service period, including for a former member; it never
  changes base salary or reads Leaderboard awards.
- Calendar reads `finance_payroll_calendar`, an amount-free, caller-context view
  of created payout/bonus expected dates (falling back to contractual dates).
  Only admins query it; underlying strict Finance RLS also denies employee reads.
  Membership dates produce birthdays/anniversaries only. An admin's own configured
  pay is included. These are reminders, not paid events or stored Calendar events;
  no financial amounts reach ordinary notifications, activity or Google projection.

## Cash Budget and rolling Forecast

`/finance/planning` is the admin-only operational planning view. It is separate
from the Finance Overview; no P&L, accrual, sales-pipeline forecasting,
recurrence generation job or tax engine is implied.

- `finance_budget_revisions` stores twelve monthly amounts per studio, year and
  existing category. Amounts are explicitly approved in the studio reporting
  currency, with currency precision enforced in PostgreSQL. Any conversion used
  while preparing a budget belongs in its required approval/revision note, not
  in ledger FX or forecast assumptions. Saving appends an immutable revision;
  optimistic revision checks and request IDs protect concurrent edits/retries.
  `finance_current_budget` selects the latest category/year revision. Zero is an
  explicit amount; an absent budget is not zero. Budget writes never create
  expectations, allocations or ledger entries. The editor supports filling all
  twelve months, followed by individual adjustments, and shows revision history.
- `calculate_finance_forecast` calculates in one database statement with exact
  numeric arithmetic. The default horizon is the current calendar month plus
  five following months; alternatives are three months, through December, and
  twelve months. Actual = historical recorded cash in the selected months through
  today (Europe/Kyiv). Remaining = unsettled expected cash still due to occur.
  Full-period Forecast = Actual + Remaining; budget is only a comparison baseline.
  No budget envelope contributes cash and no recurrence rule contributes money.
- Existing `finance_expected_balances.remaining_amount` is the only expectation
  amount. Project design/supervision/contractor bonuses, payroll components,
  recurring obligations and owner distributions all enter via their stable
  expected-item identities. Gross salary is never added alongside payout and
  remittances. Cancelled and fully settled items contribute no remaining cash.
  Confirmed includes `agreed`, including estimated amounts; Including planned
  adds `tentative`. Certainty, commitment and earned/established status remain
  independent. Owner distributions remain non-operating.
- Forecast data loading first asks the guarded schedule reconciler to cover the
  selected 3/6/year-end/12-month horizon. It creates or updates stable expected
  occurrences, then `calculate_finance_forecast` reads those items only. Rule rows
  remain diagnostics and never contribute a second amount. Repeated reconciliation
  is duplicate-safe; future revisions update only unearned, unallocated projections,
  while past, established, partial, settled and manually cancelled items remain intact.
- Expected payment date takes priority over contractual due date; due date is
  the fallback only when expected timing is absent. Past outgoing dates roll
  forward to today as immediate exposure, including overdue obligations without
  revised timing. A future revised expected date takes priority even if overdue.
  Incoming items with no date or stale past timing stay outside dated totals,
  retain their amount, and require attention. Truly undated outgoings also stay
  undated. Per-item dates and contractual dates survive monthly aggregation.
- `finance_planning_actuals` projects the existing cash effects with historical
  valuations. Refunds/reversals are signed contra-values in the original category
  direction. Transfer principal is excluded; fees are operating expenses.
  Uncategorized legacy cash and transfer fees are shown explicitly. Opening
  balances are never category actuals. Pre-cutover periods are marked unavailable.
- Future FX is an explicit flat-rate assumption: for UAH reporting the server
  requests today's effective NBU rate using the existing dated resolver. The
  same rate is held across the horizon; it is not a prediction. Admins may supply
  manual overrides, required for other reporting currencies or unsupported NBU
  rates. Each rate retains currency, source and effective date. Missing rates
  never become identity or zero and mark known totals incomplete. Actual ledger
  FX is never changed. Refreshing a live forecast may change assumptions;
  snapshots preserve them. Authorized RPC rates remain admin-supplied data.
- Cash projection starts with recorded account balances (including archived
  accounts) revalued at forecast rates, then adds only remaining net cash.
  Recorded actuals are already in that opening point and are not added again.
  This cash valuation is distinct from historical category actuals and introduces
  no manufactured operating exchange gains/losses.
- Unknown employer costs/remittances remain null and produce attention items,
  even if the known payout was settled. Missing schedule periods are coverage
  diagnostics only, starting one service month before the current month to catch
  next-month payroll. Missing supervision months and unscheduled contract value
  are also flagged. Schedule coverage is normally repaired before calculation;
  any remaining diagnostic signals an exceptional recovery case. Supervision remains
  explicitly generated in Project Finance. Totals with unresolved issues
  are labelled known subtotals, not complete forecasts. No future sales are invented.
- `finance_forecast_snapshots` saves immutable versioned expectations, original
  dates/classification/source IDs, remaining category/month totals, FX assumptions,
  budget revision references/values, coverage issues and the valued cash baseline.
  Actual ledger rows and actual category totals are not copied. Saving recalculates
  server-side under the Finance lock, with idempotent requests. Snapshot comparison
  uses `finance_movements.posting_order > snapshot.capture_order`, allocated by a
  private monotonic sequence under that same studio lock. Transaction-start
  timestamps remain unchanged and do not decide inclusion; retries retain the
  original capture. Snapshot lists use capture order, then legacy timestamps.
  Pre-migration movements have order zero. Older snapshots keep their original
  assumptions but have no reconstructible ordering boundary: saved expectations
  remain visible, and comparison explicitly requires a new capture.
  Comparison reads live historical actuals posted after capture, with financial dates from
  the capture day through the horizon. Thus later same-day payments are included;
  current-month comparison is partial. Historical backdated corrections can change
  observed actuals, but never the saved expectation. The UI lists the latest 50
  snapshots and 100 yearly budget revisions; older records remain stored.
- Tables have the existing strict Finance-admin RLS and SELECT-only grants;
  immutable triggers and guarded RPCs own writes. Caller-context report functions
  also check active-admin identity explicitly. Reporting scans are database-side,
  so the Data API row limit cannot silently truncate ledger/expected totals.

The Overview consumes these same definitions and exposes their completeness next to charts.
Any FX revaluation presentation, comparison of whole-month historical snapshots,
and generation workflow must retain these timing and historical boundaries.

## Management Overview

- `/finance` defaults to all accounts, the last three calendar months of actual
  cash through today (clipped at cutover), and the six-month Confirmed forecast.
  Actual-period, forecast-horizon and scenario controls are independent. Draft
  studios still see setup; account administration remains at `/finance/accounts`.
- `get_finance_overview` first calls the canonical forecast/automatic coverage
  boundary. It projects existing ledger views and that forecast into exact
  numeric summaries; it creates no financial sources or alternative timing rules.
  Summary breakdowns use the same RPC result and FX assumptions. Expected-item
  links filter by ID, so pagination cannot hide the selected obligation.
- Cash history uses original same-currency openings and frozen foreign opening
  valuations plus all stored reporting cash effects, including transfer legs, at
  daily closing precision. Missing legacy opening valuations make history
  unavailable until explicitly completed in Accounts. Forecast starts separately at today's assumed FX-valued
  recorded cash. A difference at the boundary is valuation, not a cash movement.
- Daily forecast points add only canonical dated remaining items. The low point
  includes starting cash and daily closing points; same-day cash ordering is not
  inferred. Report money remains decimal text through native `Intl.NumberFormat`
  string formatting, including cards, drilldowns, planning and chart tables.
  Account balances, Project Finance aggregates, opening valuations and movement valuations are selected as
  decimal text before Data API JSON parsing; bounded native inputs retain their
  existing domain types. The shared `formatFinanceAmount` uses Finance catalog minor
  units in every reporting surface, including numeric-only cards and chart tables;
  Intl currency defaults never determine Finance precision. Locale separators are preserved.
  SVG coordinates alone use JavaScript numbers. When minor units exceed the safe
  integer range at the catalog's currency precision, the plot is replaced by its open exact data table and flow bars
  are hidden while exact labels remain. Normal charts retain keyboard tooltips.
- Actual flow comparison uses `finance_planning_actuals`, excluding opening cash
  and transfer principal. Fees remain operating, refunds/reversals remain signed,
  and financing/owner distributions remain separate. Net flow includes all those
  non-transfer classifications; it need not equal the FX-valued cash change.
- Receivables use established, agreed, fixed `outstanding_amount` across all dates,
  valued with the same assumptions; currency discovery includes receivables beyond
  the forecast horizon. Upcoming cash uses canonical dated remaining items through
  today + 30 days, capped at the selected forecast end. Contractual due dates stay
  visible even when a revised expected date controls cash timing.
- Category Budget/Forecast/Actual sums the canonical monthly comparisons over the
  selected horizon, sorted by absolute variance. A full-horizon budget/variance is
  unavailable unless every month has a baseline. Monthly detail links preserve
  scenario, horizon and rate values. Budget never becomes forecast cash.
- Missing FX and forecast coverage keep affected summaries visibly incomplete.
  One expandable attention area contains overdue items and canonical issues.
  No chart substitutes missing inputs with zero or hypothetical receipts.

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
- `supabase/migrations/20260917114733_finance_project_agreements.sql`
- `src/lib/finance-projects.ts`, `src/components/finance/project-finance-section.tsx`
- `src/app/(app)/finance/project-actions.ts`
- `supabase/tests/finance_projects_rls.test.sql`, `tests/e2e/finance-projects.spec.ts`

- `supabase/migrations/20260917141123_finance_compensation_recurring.sql`
- `supabase/migrations/20260917142641_finance_schedule_lifecycle_guards.sql`
- `supabase/migrations/20260917182151_finance_automatic_schedule_occurrences.sql`
- `src/lib/finance-schedules.ts`, `src/components/finance/schedules-workspace.tsx`
- `supabase/tests/finance_schedules_rls.test.sql`, `tests/e2e/finance-schedules.spec.ts`

- `src/lib/finance-forecast.ts`, `src/data/queries/finance-forecast.ts`
- `src/components/finance/cash-planning-workspace.tsx`
- `supabase/migrations/20260917170558_finance_budget_forecast.sql`
- `supabase/migrations/20260917171353_finance_forecast_capture_boundary.sql`
- `supabase/tests/finance_forecast_rls.test.sql`, `tests/e2e/finance-forecast.spec.ts`

- `src/lib/finance-overview.ts`, `src/data/queries/finance-overview.ts`
- `src/components/finance/finance-overview.tsx`, `src/components/finance/cash-chart.tsx`
- `supabase/migrations/20260920112753_finance_overview.sql`
- `supabase/tests/finance_overview_rls.test.sql`, `tests/e2e/finance-overview.spec.ts`

- `supabase/migrations/20260920121044_finance_opening_valuation.sql`
- `supabase/tests/finance_opening_valuation_rls.test.sql`, `tests/e2e/finance-opening-valuation.spec.ts`
