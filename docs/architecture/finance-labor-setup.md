# Automatic labor costing: inputs and setup boundaries

Implementation entry points: `src/components/finance/automatic-labor-section.tsx`,
`src/app/(app)/finance/reports/automatic-labor-actions.ts`, and the current
`preview_finance_labor_activation`, `configure_finance_labor_automation`,
`finance_labor_period_basis` and `finance_labor_source_review` database functions.
See [Finance](finance.md) for recognition, payroll and reporting contracts.

## Input audit

The table covers the setup controls and their direct payroll, Worklog and legacy
dependencies. Repeated controls in the former activation and capacity forms have
the same treatment.

| Field or control | Invariant and authoritative source | Setup treatment |
| --- | --- | --- |
| Employee / bulk payroll row selection | Salary belongs to the selected studio member. Membership supplies identity. | Keep selection in payroll onboarding; Finance labor reuses it. |
| Salary amount and currency | Cost must use the agreed contractual amount and currency. Finance salary terms own these facts. | Enter once in payroll; read-only here. |
| Net / gross basis | Avoid adding deductions twice or confusing payout with employer cost. Salary terms own the basis. | Enter once in payroll. |
| Employee deductions and their known/unknown state | Unknown deductions are not zero; net payroll needs deductions to determine full cost. | Ask in payroll only when missing. |
| Employer contribution and fixed/estimated/unknown state | Do not treat an estimate or missing cost as a confirmed amount. Payroll cost revisions own updates. | Keep genuine missing-cost repair in payroll. |
| Payout day, payment-month offset, first payout month | Payment timing creates cash obligations, not earned labor cost. | Keep in payroll cash planning; do not duplicate in attribution. |
| Salary effective-from / effective-through dates | Match the right terms to the service period; avoid ambiguous salary history. | Reuse Finance term history. |
| Employment join/removal dates and employment gaps | Allocate only on employed dates. Membership transition history wins over current membership state; imported explicit dates are a fallback only without history. | Derive; no Finance re-entry or duplicate current-record check. |
| Worklog project/task/review and minutes | Attribute submitted project work; distinguish a missing report from a submitted zero-hour day. | Reuse Worklog. |
| Worklog internal activity and minutes | Internal work consumes daily capacity but remains studio cost. | Derive directly; no internal project required. |
| Studio daily hours | Payroll shares need scheduled capacity, not logged time as the monthly denominator. Current studio setting owns the ordinary duration. | Reuse; editor only for a dated or employee exception. |
| Monday–Sunday weekday choices | Scheduled days determine the denominator. Dated Finance revisions override the shared Monday–Friday app convention. There is no separate stored studio workweek history. | Prefill existing rules; edit only an exception. |
| Schedule effective date | The studio workday and Monday–Friday apply to all source dates without an applicable override. | Ask only for an intentional dated exception; preview before saving. |
| Schedule employee scope | An individual exception must not change everyone else's denominator. | Show only in the exception editor. |
| Approved leave and studio holidays | Avoid requiring reports for approved absence; avoid double-counting overlapping absence minutes. | Read existing approved requests and studio days off. |
| Internal-project selector | Older installations may store studio work as project tasks. An explicit exclusion keeps that project at studio level. | Optional at first activation; preserve saved exclusions. Never infer from a project name. |
| Internal-project confirmation checkbox | Repeated the meaning of the selector without supplying another fact. | Removed. |
| Recurring payroll payment: included in salary / separate expense | Prevent counting the same expense as payroll and as a recurring service. A payroll category alone cannot establish inclusion. | Ask only for unresolved payroll-related terms; reuse matching saved decisions. |
| Payroll-source confirmation checkbox | Repeated the explicit source choices. | Removed; save records choices and source evidence atomically. |
| Historical-capacity confirmation checkbox | Repeated the entered effective date and reviewed cost impact. | Removed; preserve explicit historical date and stale-preview validation. |
| Attribution start date / edit start | Determines which days automatic attribution covers. It is independent of posting activation and historical schedule dates. | One settings form; changing an existing start is explicit and history guarded. |
| Preview and save | Prevent saving a proposal based on changed payroll, Worklog, schedule or allocation evidence. | Keep the read-only cost preview and digest-bound save; unchanged settings create no capacity revision. |
| Request IDs, digests and source versions | Retry safety and concurrent-change detection. | Server contract only, never administrator configuration. |

## Warnings and repair actions

| Warning or action | Why it remains, or why it was removed |
| --- | --- |
| Missing salary / incomplete components; open payroll | Real missing business information. Missing-salary checks use effective coverage, not merely the existence of a future term. |
| Missing separate Finance schedule | Use the studio workday and Monday–Friday for current and historical source dates; do not block project costs or create capacity history. |
| Unresolved payroll source; already recognized separate expense | An actual double-counting ambiguity or immutable expense history. Existing separate recognition must be corrected before cash-only reclassification. Unrelated services do not reopen review. |
| Missing Worklog dates; open Worklog | Actual absent evidence; cannot be replaced by guessed hours. |
| Outside-schedule work / partial employment | A dated exception affects the normal salary allocation. Preserve review and source detail. |
| Missing FX; rate source, manual rate and recalculate | Foreign-currency amounts need dated valuation. Reuse an existing valid quote; ask only when it is unavailable. |
| Provisional coverage and studio remainder | Explain elapsed-period calculation and legitimate unattributed salary. Neither implies a missing internal project. |
| Pending correction; current/proposed amounts; approve correction | Existing allocations must not silently change after source edits. Keep explicit correction approval. |
| Manual ownership / protected history | Automatic work must preserve manual allocations and reviewed history. Keep these notices when affected. |
| Stale preview / request conflict / history-protected errors | Preserve concurrency, retry and immutable-history safeguards. Removing checkboxes does not remove these guards. |
| Mandatory internal-classification warning | Obsolete after Worklog gained explicit internal activities. Removed; task/review project time participates normally unless a saved exclusion applies. |
| Duplicate manual “unconfirmed” warnings for automatic periods | The automatic period already reports its state. Legacy warnings now use only legacy/manual sources. |

## Related flows that retain separate responsibilities

- Payroll onboarding creates salary terms and cash timing; it is the source of
  missing salary facts, not another labor-automation setup.
- Historical labor is a read-only salary/Worklog calculation. It does not enable
  posting, create payables, recognize costs or modify allocations.
- Provisional calculations do not create recognition entries. Closed-period
  finalization and later corrections retain source, FX and history guards.
- Recognition activation enables future economic posting across Finance. Labor
  setup does not enable it or infer its date from a capacity date.
- Manual confirmation, reconciliation and allocation remain for legacy/manual
  obligations. Their source/version, FX, reason, project, amount and pool-cap
  controls protect actual financial edits; they are not required auto setup.
- Old immutable records and historical migration definitions are retained.
  Superseded configuration implementations are private and non-executable by
  client roles; their historical existence is not an additional setup flow.
