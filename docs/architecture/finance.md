# Finance

Finance is a separate, studio-scoped management/cash-planning domain. V1 access
is administrator-only. Project lifecycle, CRM budgets, equipment/service costs,
Calendar salary reminders, and Leaderboard bonuses do not create Finance data.
`/finance` owns the management Overview; `/finance/accounts` owns setup/accounts; `/finance/movements` owns actual cash and recorded
balances; `/finance/expected` owns expectations and matching; `/finance/categories`
owns classification; `/finance/schedules` owns compensation and recurring rules;
`/finance/planning` owns cash budgets, rolling forecasts and saved expectations. The
operational routes remain in primary Finance navigation; Accounts and Categories
remain deep-linkable configuration routes available through the Finance manage menu.
All inherit the same administrator-only layout and messages.
Project details adds an administrator-only `view=finance` tab with its own scoped
Finance messages; it uses these same expectations, movements, and matching RPCs.

## Foundation and historical boundary

- One `finance_settings` row defines the studio's reporting currency and cutover
  date. Historical setup openings represent cash at the **beginning** of that
  date; they are neither revenue nor expense and are not transaction records.
- Setup starts as a draft. Administrators can correct settings and account
  currencies/openings until explicitly finalizing setup. Finalization records
  the actor/date and requires an active account. Admins can reopen only while
  substantive Finance history is absent.
  Draft cutover dates may be in the future, but finalization requires cutover on
  or before today's `Europe/Kyiv` business date. A database trigger also protects
  direct finalized inserts/updates; the requested date is never silently changed.
  If legacy future-finalized state has history, preserve it and wait until cutover
  before using current-cash reports.
- After finalization, reporting currency, cutover date, and historical account
  currencies/openings are locked. Reopening requires no movements (including dated
  openings/corrections and transfers), expected items, obligations, trip entries,
  project terms, budget revisions, forecast snapshots or payroll cost revisions.
  Accounts, seeded categories and schedule configuration do not block it. The
  guarded RPC returns settings to draft, keeps account opening amounts and
  unrelated data, and clears only opening FX valuations for re-entry. Later
  accounts keep the historical opening column at zero and may record a dated account-opening ledger event. An existing
  account with zero historical opening and no ledger activity can record that
  event once. Renaming, archiving, and restoring remain available; restoring
  does not unlock openings.
- An account represents one independent cash pool/currency pocket. Its
  `account_type` (`bank`, `cash`, `payment_service`, `other`) is UI metadata only;
  existing accounts default to `other`. A card using
  an existing balance does not create another pool. Archived accounts and their
  openings remain historical data; archival never removes balances.
- Accounts have a `(studio_id, id)` unique key for future tenant-safe references.
  There is no client delete path; foreign keys restrict destructive parent deletion.
- Account creation requires a request UUID, retained for the create form's lifetime
  and renewed for each new Add account flow. Draft account creation uses
  `save_finance_account`; finalized creation with a dated opening uses
  `create_finance_account_with_opening`. Both use the studio lock and immutable
  `finance_planning_requests` audit. Identical retries,
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
- Recorded balance is historical setup opening plus **all** signed entries,
  including dated account openings, balance adjustments, reversals, and
  archived-account history. `finance_account_balances` derives it; there is no
  mutable balance cache. `account_opening` and `balance_adjustment` movements
  have `balance` nature, a financial date, immutable signed entries, and no
  operating category or expected-payment availability. `finance_cash_effects`
  retains them for dated cash-balance history; `finance_planning_actuals`
  excludes them from Cash Flow, P&L, budgets, payroll and forecast actuals.
  Both balance and cash-effect views use `security_invoker=true` and preserve RLS.
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
- Manual expected-payment creation defaults to agreed/fixed. Planned commitment
  and estimated amount are separate choices; only agreed/fixed payments expose the
  optional collection/payment override. Due date initially also drives expected
  cash timing; a separate expected date never moves the overdue boundary. Existing
  records retain their dates, status, description and explicit established value on edit.
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

- Project Finance presents project value, collected, outstanding receivables and
  future planned payments separately. Unscheduled contract value is an actionable
  exception, not dated forecast cash. The next project payment uses expected date
  before due date and is selected independently of list pagination and filters.
  Stream navigation keeps design value separate from supervision, contractor
  bonuses and other income; compact rows disclose settlement actions and history.

- `finance_project_terms` retains immutable, numbered design/supervision revisions
  with the actor and a required agreement/amendment note. Current terms are the
  latest revision, not a copied CRM budget. Saves use the existing studio lock,
  request audit/idempotency, and optimistic revision checks.
- The value/payment builder supports fixed pricing or area × rate. Immutable
  `finance_project_plan_revisions` records the area/rate used and reviewed item
  order alongside the canonical terms revision; legacy revisions remain fixed
  values. Later project-area edits only show a mismatch. Recalculation requires
  a new reasoned revision. Native agreement currency stays authoritative; current
  NBU/UAH references are read-only context and never enter contract or ledger values.
- Percentage templates distribute the editable contractual value after subtracting
  the **full** scheduled value of every active item with any allocation history,
  including released/refunded matches. Protected rows are not written by the builder.
  Percentage previews use integer minor units, floor intermediate payments and put
  the remainder in the final payment. Area pricing rounds once to currency precision.
  Keep-existing and manual amount modes still require explicit reconciliation;
  an intentional unscheduled remainder has no manufactured date.
- `save_finance_project_plan` composes the canonical terms, item and cancellation
  RPCs under the same studio lock. It checks revision and complete active-item
  versions/history, rejects over-allocation, applies decreases before increases,
  and records one idempotent request. Removed unpaid items are reasonedly cancelled,
  never deleted. Existing expected IDs survive edits, protected history is retained,
  and the operation creates no cash. Pricing snapshots use admin-only RLS and
  immutable history; `finance_project_plan_items` reads in caller context.
- `finance_project_items` adds permanent project/source context to Phase 3 expected
  items. It contains no separate payment or settlement state. Design, supervision,
  contractor bonus, and other income use incoming Finance expectations. Project
  payment recording composes the existing ledger/allocation RPC and returns to
  the originating project; global matching sees the same expected and movement IDs.
- Design schedules have arbitrary names/counts, independent due/expected dates,
  and the agreement currency. Active scheduled amounts cannot exceed the current
  contract. A shortfall stays **unscheduled**, with no invented forecast date.
  Currency is fixed after any schedule history. Value-only amendments leave the
  schedule unchanged; the value/payment builder explicitly saves a reviewed unpaid
  schedule with its value revision in one transaction. Submitted revisions remain
  in the planning audit. After any allocation history, project-item amount,
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

- The configuration page stacks full-width compensation and recurring sections.
  Compact salary rows show employee, amount/basis, payout timing and actionable
  attention; only exceptional periods are exposed. Detailed costs and immutable
  history sit behind disclosure. New agreements default employer cost to explicit
  zero; admins can choose unknown. Forecast groups missing payroll costs by
  employee and component.
- Forms use month-level effective periods, with remittances/employer costs exposed
  for gross pay or on request. Bonus notes and initial recurring-agreement notes
  are optional, with localized defaults; recurring revisions still require a reason.
  Recurring next-payment links use maintained, unsettled expected items and their
  expected-date override, excluding cancelled and past items; no cadence is
  recalculated in the browser.
- Optional team setup lists active employees without an unstopped payroll agreement.
  Shared currency, basis and payout defaults allow per-person overrides; initial
  months use employment start, bounded by any previous permanent stop. Each selected
  row uses the existing guarded save with its own stable request ID. Successful rows
  stay saved and locked while failed rows can be corrected and retried; existing
  agreements and revisions are never updated by this workflow.
- Recurring groups are studio-owned, one-level organizational metadata persisted in
  `finance_recurring_groups`; nullable `finance_schedules.group_id` means Ungrouped
  for existing rules. Groups can mix financial categories and currencies. Creation,
  rename, ordering and assignment use admin-guarded RPCs and tenant-scoped RLS;
  direct writes remain denied. Group moves update no terms, expected items,
  obligations, ledger entries or reporting classification. The recurring-save
  wrapper atomically assigns a group while delegating all financial validation to
  the existing schedule RPC; replay cannot undo a later organizational move.
  Checkboxes and Ctrl/Cmd-click select recurring rules across groups. Bulk moves
  call the same guarded assignment per rule: completed moves are retained, failures
  remain selected for retry, and assigning the same destination again is safe.
  No financial fields are accepted by the bulk organization action.
- `/finance/schedules` is admin-only. `finance_schedules` identifies either an
  employee's monthly payroll or a recurring studio obligation; immutable
  `finance_schedule_terms` holds numbered, effective-dated revisions. Starts are
  month starts and optional inclusive ends are month ends. Later revisions must
  start in a future month, except payroll may amend the current month while
  that occurrence has no allocation history or completed cost revision.
  Recurring revisions cannot split an existing multi-month service period.
  The first payroll form suggests the employee's current Team start month when
  available; the saved term is independent and later Team edits do not change it.
  History derives valid-through from the next revision, submitted end and permanent
  stop boundary.
- Payroll keeps agreed compensation (net/gross), employee payout, optional
  employee deductions/remittances and additional employer cost separate. Admins
  supply amounts; PostgreSQL validates exact currency precision and agreement
  arithmetic. Net equals payout, with remittances additional; gross equals payout
  plus explicit deductions. Unknown costs remain null, confirmed zero is explicit,
  and estimated employer cost remains estimated. New payroll defaults employer
  contributions to explicit zero; existing unknown terms remain unchanged.
  There is no statutory tax engine.
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
  completed occurrences. Compensation amendments preserve each settled period,
  including any released allocation; other unpaid periods can adopt the new terms.
  Forecast diagnostics read the latest explicit
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

- Local Forecast, Budget and Forecast history modes share this route; Forecast is
  the default. Horizon/scenario changes apply immediately and retain manual rates.
  Planning loads `get_finance_overview`, whose embedded canonical forecast supplies
  both summaries/chart and monthly detail under one calculation and FX scope.
  Historical flow bars cover the last three calendar months through today; category
  comparison covers the forecast horizon. They retain separate date labels.
  Attention, monthly detail and assumptions are disclosures. Budget's annual
  category matrix opens the existing immutable revision editor; it creates no cash.
  History compares a selected snapshot with subsequent recorded cash.

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
  is duplicate-safe; payroll revisions update eligible unpaid current and future
  projections, preserving earned status. Past, allocated and manually cancelled
  items remain intact.
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
  even if the known payout was settled. Payroll diagnostics are grouped by
  employee and missing component. Missing schedule periods are coverage
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

- `/finance` is the financial control center: recorded cash, recent net flow,
  next-30-day outflow, overdue count, actionable coverage issues, current-month
  operating flow bars and five upcoming payments. The default actual scope is
  the last three calendar months through today, clipped at cutover; its dates
  are explicit. Forecast/scenario, FX, Budget editing and history belong to
  `/finance/planning`. Draft studios still see setup; account administration
  remains at `/finance/accounts`. Finance routes share a dashboard-width shell
  and tab navigation; Accounts and Categories stay in the manage menu.
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
- Overview crops the existing daily projection at `upcomingThrough` (today + 30
  days, capped at the canonical horizon). Its final step carries the last canonical
  closing value to the window edge; it never recalculates cash. The canonical low
  point is shown only when its date falls within this window. Planning retains
  the full series. The Today boundary separates historical valuation from current
  assumed FX; Overview links preserve the report's horizon, scenario and FX rates.
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
  scenario, horizon and rate values. Overview shows only up to three nonzero
  configured variances, with an explicit forecast horizon; absent baselines do not
  produce an empty panel. Budget never becomes forecast cash.
- Missing FX and forecast coverage keep affected summaries visibly incomplete.
  One attention panel shows overdue items and canonical issues, with three
  visible actions and a disclosure for the rest. Missing FX is grouped into one
  planning action; per-item links open the owning workflow. Current-month income
  and expense bars use existing operating flow rows, with financing and owner
  distributions separately labelled below them.
  No chart substitutes missing inputs with zero or hypothetical receipts.

## Business trips

`/finance/trips` is an admin-only operational workflow, reached through the Finance
manage menu. Project Finance shows linked trips and their reporting-currency cost
separately from contract income. Completed/archived projects remain reconcilable.

Trip detail is a single expense sheet: six persistent type rows show native-currency
Plan, Actual and Difference, with reporting equivalents secondarily. Plan amounts
open inline editors; actuals start from their type row and expand into individual
receipts. A single compatible unused plan is preselected; multiple candidates require
an explicit choice. Enter submits and Escape cancels without posting. Per-diem rate,
currency and calculation are inline; coverage/day overrides and optional cash timing
use the shared reduced-motion-aware disclosures. Summary payer totals and actionable
traveler balances stay beside this workflow. Calendar linkage is compact metadata
unless its lifecycle or project attribution needs attention. Trip metadata, advances
and deliberate plan removal retain dialogs.

- `finance_trips` stores destination, dates, optional same-studio Project, status
  and versioned metadata. `finance_trip_travelers` links same-studio Team identities
  and snapshots names. Removing a traveler only deactivates their participation;
  receipts and settlements survive. A Project link locks after the first financial
  entry. Metadata edits never revalue historical entries or update settlement labels.
  Calendar business-trip events link idempotently through `calendar_source_id`;
  `calendar_event_id` is the live same-studio FK, cleared on physical deletion.
  Event/participant writes synchronize title, inclusive Kyiv dates, destination
  (project city/country), note and active travelers. Project changes synchronize
  only before the first financial entry; afterward the financial project stays
  fixed and the UI explains divergence. Calendar-linked metadata cannot be edited
  through Finance. Finance status remains an explicit administrator decision.
  Eligible existing events are linked on migration and Finance finalization;
  Calendar never invents Finance setup. Employees can create operational Calendar
  events without gaining Finance access or creating financial entries.
- `finance_trip_entries` is immutable, preserving original amount/currency/date,
  payer, optional label/note, valuation provenance and ledger/plan links. Types are
  travel, accommodation, meals, local transport, visa/insurance and other. One
  outgoing `business_travel` reporting category is created when first used
  (or an existing matching custom Business travel category is reused); the
  internal types do not expand the global category catalog. Existing matched cash
  retains its original reporting classification and valuation.
- Plan and Actual are separate exact reporting totals. Plan uses current
  `resolveForecastAssumptions` rates and exact reporting-currency rounding through
  the shared project reference-value helper. Original plan amounts/currencies are
  immutable; new foreign plans store no historical FX valuation and require no
  account. Missing rates leave the estimate/variance incomplete rather than zero.
  Explicit per-currency manual assumptions use the same `fx_CODE` URL inputs as
  Forecast; actuals always retain their own historical valuation. The trip list
  and detail label Plan, Actual and Variance, and absent plans show a dash with an
  actionable planning cells. Only expenses contribute
  Actual; advances and reimbursements never contribute a second cost. Optional
  dated planned cash creates one tentative estimated expected item. Selecting a
  related plan when recording its actual retires that expectation atomically, while
  retaining the plan baseline. This completes one planned payment, not a partial
  budget drawdown. A paid plan can convert with its exact whole payment; existing
  allocations are explicitly released and rematched. Budget remains independent.
- Direct studio expenses record or match a whole, unallocated outgoing operating
  movement. An internal fully settled expected item consumes that payment through
  canonical allocation semantics. Contextual posting, matching, receipt insertion
  and plan replacement share one transaction and idempotent request audit. A failed
  match rolls back all cash. Refunds/reversals remain ledger operations; net trip
  cost follows their signed entries without overwriting the original receipt.
- Personal expenses create no cash. `finance_trip_balances` maintains stable
  outgoing/incoming expected identities per traveler/trip/original currency, because
  canonical matching requires the same currency. Signed balance = personal expenses
  − net advances − reimbursed allocations + returned allocations. Positive balances
  are reimbursements; negative balances are unused advances while planned/active,
  and become expected incoming returns when completed/cancelled. Completing a trip
  runs reconciliation. Returns use the existing `other_income` operating category;
  this is cash management, not expense recognition or statutory accounting.
- Advances use the same contextual ledger/matching path as direct payments, with
  the existing advance intent and an immutable trip link. Allocation histories,
  including partial reimbursement, release and cash corrections, drive remaining
  balances. Refund reversal explicitly rematches restored trip cash. Cash-owning
  trip allocations cannot be manually released and reused for another expense;
  correct the cash through the ledger. Derived expectation amounts/classification
  cannot be edited from generic Expected payments; those rows link back to the trip.
- Calendar cancellation, type change or deletion marks the source lifecycle.
  Without any financial entries the linked trip becomes cancelled. With entries,
  Finance status, obligations and all financial history remain untouched for
  explicit administrator reconciliation. Source UUID and financial records survive
  physical event deletion. Removed travelers remain historical identities.
- Cancelling a trip in Finance preserves existing expenses, plan commitments and settlements;
  it blocks new entries and confirms unused advance returns. A planned item can be
  explicitly reversed when unallocated. Personal expense corrections append a
  reasoned negative copy; a replacement is a new expense. No financial deletion API
  exists. Historical per-diem inputs remain on the original/correcting entries.
- `edit_finance_trip_entry` composes existing operations in one studio-locked,
  idempotent transaction. Plan edits append a correction and replacement without a
  user-entered reason; allocated/consumed plans remain protected. Personal expense
  edits require a reason and reconcile reimbursement through the existing receipt
  correction. Studio payment edits require confirmation and a reason, reverse the
  original cash at its historical valuation, then record the replacement. Adjusted
  or refunded payments keep the specialist payment workflow. A failed replacement
  rolls back the entire edit. The original actual retains its unique plan link and
  retired expectation; the immutable edit audit connects it to its replacement.
  No posted row is overwritten, and changes remain available in history.
- `private.finance_valuation` supplies the shared ledger/receipt valuation: exact
  PostgreSQL arithmetic and currency-catalog rounding, dated NBU for UAH or explicit
  manual rates. Studio receipts copy ledger FX; personal receipts use the
  same historical resolver/rule. Plan reporting uses current assumptions independently. Original
  currencies are never overwritten. Report totals and detail values use decimal text,
  exact integer previews and complete paginated reads, not floating-point valuation.
- Per diem is daily rate × inclusive days × covered travelers. The form defaults
  to all active travelers, permits a selected subset and an explicit eligible-day
  override, and displays the live calculation. Immutable entry coverage references
  keep the selected identities even when Calendar participants later change. The
  database verifies active same-trip coverage, count, multiplication and precision;
  corrections copy the original coverage. Payer semantics are unchanged: one payer
  can cover multiple travelers. Legacy entries retain their original single-person
  calculation. There are no statutory rates. Receipt uploads are not introduced: the existing avatar upload path is not
  a private Finance document store.
- New tables are SELECT-only behind strict Finance-admin RLS. Guarded RPCs use the
  existing studio lock and immutable request audit; tenant-safe foreign keys protect
  all Project, traveler, expectation and movement references. Normal Team readers
  gain no Finance access. Browser forms retain request UUIDs across errors, and
  successful request recovery occurs before another FX lookup.

Sources: `src/lib/finance-trips.ts`, `src/data/queries/finance-trips.ts`,
`src/app/(app)/finance/trips/`, `src/components/finance/trips-workspace.tsx`,
`supabase/tests/finance_trips_rls.test.sql`, `tests/e2e/finance-trips.spec.ts`.

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
- `src/components/finance/project-value-builder.tsx`, `src/lib/finance-project-plan.ts`
- `supabase/migrations/20260921184630_finance_project_payment_builder.sql`
- `supabase/tests/finance_project_plan_rls.test.sql`, `tests/e2e/finance-project-builder.spec.ts`

- `supabase/migrations/20260917141123_finance_compensation_recurring.sql`
- `supabase/migrations/20260917142641_finance_schedule_lifecycle_guards.sql`
- `supabase/migrations/20260917182151_finance_automatic_schedule_occurrences.sql`
- `supabase/migrations/20260920211341_finance_recurring_groups.sql`
- `src/lib/finance-schedules.ts`, `src/components/finance/schedules-workspace.tsx`
- `src/components/finance/payroll-setup.tsx`, `tests/e2e/finance-payroll-setup.spec.ts`
- `supabase/tests/finance_recurring_groups_rls.test.sql`
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
