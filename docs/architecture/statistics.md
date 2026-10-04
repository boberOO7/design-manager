# Statistics

`/statistics` is an admin-only, read-only studio report. Its layout and
`src/data/queries/statistics.ts` both use `getActiveStudioAdmin()`. Queries use
the caller's Supabase client and existing RLS; credited output uses the guarded
canonical attribution query. Only aggregate chart/report data reaches clients,
not employee salary records. Sources are paged independently, without queries
per project or person or Finance occurrence maintenance.

Definitions live in `src/lib/statistics.ts`, with focused colocated tests.

| Measure | Source and definition | Historical limit |
| --- | --- | --- |
| Completed projects / delivered physical area | Production-enabled Projects currently completed, or archived with `completed_at`; count each project once and sum `total_area_m2` by official completion date. | Reopening clears completion; this is retained completion state, not every completion cycle. |
| Credited production | Non-voided canonical `productivity_attributions`, under current project inclusion rules, summed by Kyiv completion day. | Credits are rebalanced accounting, not unique physical area or immutable allocations. Exclude legacy task credits without a matching real task completion date. |
| Completed-task activity / contributors | Unique currently completed Tasks with dates; contributors with positive dated credits. | Recorded workflow context only, not a cross-era productivity score or historical headcount. |
| Project duration | First logged status transition must be `planned → active`; a logged completion must exist; elapsed calendar days end at official `completed_at`, including pauses. | Exclude missing activation evidence and completion before activation. Planned `start_date` is never an actual start substitute. Completion-date corrections may precede the later recorded completion event. |
| Payroll costs | Preserved payroll obligations by closed service month; sum active payout, deduction and employer-cost expected items, separated by currency. | Obligations, not cash payments. Unknown components, missing expected schedule occurrences and cancelled payouts leave a known subtotal. Bonuses are excluded. |
| Payroll cost per credited m² | Recorded costs divided by dated credits in the same closed month, when recorded salary coverage is complete, credits are positive and only one currency is present. | Studio-level recorded-data proxy, not project profitability or proof of full production capture. Legacy gaps and attribution corrections can change it. |

Salary terms linked to the historical obligation distinguish explicit zeros
from missing costs; current salary terms never recalculate amounts. Completed
unknown-cost revisions include zero corrections with cancelled predecessor
items. Effective-dated schedule history checks for missing generated obligations,
including across currency groups.

The first observed source date is labelled as earliest evidence, not a proven
collection-start boundary. Earlier periods are unavailable, and subsequent
zeros mean no retained dated records. Future dates are excluded; the current
production month is partial and current/future payroll months are excluded.

Historical headcount, observed attendance, historical contract/revenue values
and project margin are omitted: current memberships, planned Calendar events,
current contractual terms and unallocated studio payroll do not establish them.
