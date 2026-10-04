# Statistics

`/statistics` is an admin-only, read-only studio report. Its layout and
`src/data/queries/statistics.ts` both use `getActiveStudioAdmin()`. Queries use
the caller's Supabase client and existing RLS; credited output uses the guarded
canonical attribution query. Only aggregate chart/report data reaches clients,
not employee salary records. Sources are paged independently, without queries
per project or person or Finance occurrence maintenance.

The URL preserves shared `period=3|6|12|year|all` and
`section=overview|leads|team|calendar`. Periods end on today's Kyiv date;
all-history starts at the earliest retained source date across the sections.
Current cohort outcomes and future attendance commitments are labelled
separately. Definitions live in `src/lib/statistics*.ts`, with colocated tests.

| Measure | Source and definition | Historical limit |
| --- | --- | --- |
| Completed projects / delivered physical area | Production-enabled Projects currently completed, or archived with `completed_at`; count each project once and sum `total_area_m2` by official completion date. | Area is the current project field, not a historical snapshot. Reopening clears completion; this is retained completion state, not every completion cycle. |
| Credited to employees | Non-voided canonical `productivity_attributions`, under current project inclusion rules, summed by Kyiv completion day. Deduplicate ledger IDs, not contributors or disciplines. | Includes unfinished projects and surviving snapshots of deleted work. Stage 1/3 shares rebalance; Stage 2 area is snapshotted. For retained tasks, exclude legacy credits without a matching completion date. No normalized studio-output metric is invented. |
| Completed-task activity / contributors | Unique currently completed Tasks with dates; contributors with positive dated credits. | Recorded workflow context only, not a cross-era productivity score or historical headcount. |
| Completed project duration | First logged status transition must be `planned → active`; elapsed calendar days end at official `completed_at`, including pauses. The authoritative completion date does not require a duplicate completion audit event. | Exclude missing activation and project/task completion before activation, which can reveal administrative import timestamps. Genuine same-day completions remain zero. Planned `start_date` is never an actual start substitute. |
| Current project age | Active/paused production projects with a reliable first activation, through today, regardless of selected reporting period; same chronology checks as completed duration. | Snapshot age, not completion duration or active working time; unknown starts are excluded with sample coverage. |
| Payroll costs | Preserved payroll obligations by closed service month; sum active payout, deduction and employer-cost expected items, separated by currency. | Obligations, not cash payments. Unknown components, missing expected schedule occurrences and cancelled payouts leave a known subtotal. Bonuses are excluded. |
| Payroll cost per credited m² | Recorded costs divided by dated credits in the same closed month, when recorded salary coverage is complete, credits are positive and only one currency is present. | Studio-level recorded-data proxy, not project profitability or proof of full production capture. Legacy gaps and attribution corrections can change it. |
| New leads / cohort outcomes | One `crm_leads` ID, selected by Kyiv `created_at`; current invalid/false/duplicate leads excluded. Current won / all valid cohort leads, including open and lost, observed today. | Not a historical funnel or project-creation conversion; won can be set manually. Deletion removes lead/history. Known source keys normalize case and use CRM translations; other free text stays intact. |
| Lead stage timing | The same creation cohort; consecutive matching `crm_lead_history` entry/exit transitions yield completed stage stays, in elapsed days. Repeated stays are separate observations with distinct lead counts. New → contacted requires continuous history from actor-backed new-lead creation. | Null-actor created rows may be legacy backfills; never use them as stage entry. Later transitions can establish new entries. Open stays, gaps and ambiguous simultaneous transitions are excluded; no sample means unavailable. |
| Contact → recorded project start | Median calendar days from entered `first_contact_date` to first logged `planned → active` on a linked won lead's project; report usable sample. | No creation-date fallback; exclude missing or contradictory chronology, including earlier task completions. Contact date remains editable and earlier history may be missing. |
| Team absence usage | Approved `time_off_requests`, clipped to selected dates and today; partial wall-clock hours clipped to now. Union overlaps per person/category. Full days use the vacation domain's inclusive calendar-day convention. | Days/hours and absence categories stay separate. Future partial hours and full days from tomorrow appear as current commitments across all dates. Preserve inactive people with records, omit private notes. No parallel vacation-balance model. |
| Scheduled make-up | Noncancelled `work_makeup` occurrences by organizer, with recurrence/overrides; timed minutes clipped to period/now. Fully included ended all-day records use canonical `getWorkMakeupMinutes` (8 hours per occurrence). | Scheduled accounting only, not verified work. All-day records crossing period boundaries have no canonical per-day split: exclude their hours with a counted warning. Future/ongoing remainder is separate across all dates; live recurring future totals are unavailable rather than expanding to an arbitrary or potentially distant forecast date. Never subtract hours from leave days. |
| Calendar records | Canonical local `calendar_events`, expanded with recurrence helpers, override/cancellation identity; no participant or remote-copy joins. Count elapsed occurrences overlapping the Kyiv range once, in the month of first included date. | No attendance/completion evidence. Ongoing/future records within selected dates are separate. Clip timed hours and all-day calendar spans by period/month; all-day spans never become work hours. Missing duration remains unavailable. |
| Calendar people | Unique people in the event type’s canonical roles (`getCalendarEventDetailConfig`), including non-declined invitees, per elapsed occurrence; event-person counts and clipped timed participant-hours. Independently paged associations cannot multiply event totals. Generated repeats inherit template people; concrete overrides use their own. | Scheduled involvement, not attendance; creator-only ownership does not establish participation. Pending invitations count; all-day/invalid durations add no hours. Current participant records do not establish past invitation edits. |
| Project Calendar burden | Linked elapsed event count / distinct represented project IDs; measurable timed hours / the same denominator, including archived and all-day-only projects. Show unlinked count/time separately. | This is per represented project, not per all active studio projects. Each event has one nullable project link; studio totals count its occurrence once. |

Salary terms linked to the historical obligation distinguish explicit zeros
from missing costs; current salary terms never recalculate amounts. Completed
unknown-cost revisions include zero corrections with cancelled predecessor
items. Effective-dated schedule history checks for missing generated obligations,
including across currency groups.

The first observed source date is earliest evidence, not a proven collection
boundary. Production series retain pre-evidence gaps; CRM/Calendar zeros mean
no matching retained records, not confirmed historical tracking. The current
month is partial and current/future payroll service months are excluded.

Historical headcount, observed attendance, historical contract/revenue values
and project margin are omitted: current memberships, planned Calendar events,
current contractual terms and unallocated studio payroll do not establish them.
