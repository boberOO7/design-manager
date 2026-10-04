import type { Database } from "@/types/database.types";
import { median, recordedProjectStart, type StatisticsActivity, type StatisticsTask } from "@/lib/statistics";
import { getKyivDateOnly } from "@/lib/validation/project";
import { CRM_LEAD_SOURCE_KEYS } from "@/lib/validation/crm";

export type StatisticsLead = Pick<Database["public"]["Tables"]["crm_leads"]["Row"],
  "id" | "created_at" | "first_contact_date" | "status" | "invalid_reason" | "project_id" | "source">;
export type StatisticsLeadHistory = Pick<Database["public"]["Tables"]["crm_lead_history"]["Row"],
  "id" | "lead_id" | "event_type" | "actor_id" | "previous_status" | "new_status" | "created_at">;

const DAY = 86_400_000;
const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

function validContactDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

const timing = (values: number[]) => ({ sample: values.length, medianDays: median(values),
  meanDays: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null });

/** Closed, observed stage stays only. Legacy created rows were backfilled with
 * the then-current status and a null actor; they cannot establish stage entry.
 * A later recorded transition can establish a new entry even with older gaps.
 */
function leadTimings(leads: StatisticsLead[], history: StatisticsLeadHistory[], through: string) {
  const stages = (["contacted", "discussion", "proposal"] as const).map(status => ({ status, days: [] as number[], leads: new Set<string>() }));
  const firstContact: number[] = [];
  const unique = [...new Map(history.map(row => [row.id, row])).values()];
  for (const lead of leads) {
    const rows = unique.filter(row => row.lead_id === lead.id && Number.isFinite(Date.parse(row.created_at))
      && Date.parse(row.created_at) >= Date.parse(lead.created_at) && getKyivDateOnly(new Date(row.created_at)) <= through
      && (row.event_type === "created" || row.event_type === "status_changed"))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let entry: StatisticsLeadHistory | null = null;
    let newAt: number | null = null;
    const ambiguous = new Set(rows.filter((row, index) => index > 0
      && Date.parse(rows[index - 1].created_at) === Date.parse(row.created_at)).map(row => Date.parse(row.created_at)));
    for (const row of rows) {
      const timestamp = Date.parse(row.created_at);
      if (ambiguous.has(timestamp)) { entry = null; newAt = null; continue; }
      if (row.event_type === "created") {
        entry = row.actor_id && timestamp === Date.parse(lead.created_at) ? row : null;
        newAt = entry?.new_status === "new" ? timestamp : null;
        continue;
      }
      if (!row.previous_status || !row.new_status || row.previous_status === row.new_status) { entry = null; newAt = null; continue; }
      if (entry?.new_status === row.previous_status) {
        const stage = stages.find(stage => stage.status === row.previous_status);
        if (stage) { stage.days.push((timestamp - Date.parse(entry.created_at)) / DAY); stage.leads.add(lead.id); }
        if (newAt !== null && row.new_status === "contacted") {
          firstContact.push((timestamp - newAt) / DAY);
          newAt = null;
        }
      } else newAt = null;
      if (["won", "lost", "invalid"].includes(row.new_status)) newAt = null;
      entry = row;
    }
  }
  return { firstContact: timing(firstContact), stages: stages.map(stage => ({ status: stage.status, ...timing(stage.days), leads: stage.leads.size })) };
}

/** Current outcomes of a creation-date cohort, not historical conversions.
 * Contact-to-start uses the explicitly recorded contact day and actual logged
 * activation. Since contact is date-only, its unit is Kyiv calendar days.
 */
export function buildCrmStatistics(
  leads: StatisticsLead[],
  activities: StatisticsActivity[],
  range: { from: string; through: string },
  today: string,
  tasks: StatisticsTask[] = [],
  history: StatisticsLeadHistory[] = [],
) {
  const through = range.through < today ? range.through : today;
  // The source is one current row per lead. Repeated query rows must not count
  // lifecycle changes or linked-project fan-out as additional leads.
  const uniqueLeads = [...new Map(leads.map(lead => [lead.id, lead])).values()];
  const selected = uniqueLeads.filter(lead => {
    const timestamp = Date.parse(lead.created_at);
    if (!Number.isFinite(timestamp)) return false;
    const date = getKyivDateOnly(new Date(timestamp));
    return date >= range.from && date <= through;
  });
  // Invalid is the domain's false/duplicate lead state, regardless of reason.
  const cohort = selected.filter(lead => lead.status !== "invalid");
  const won = cohort.filter(lead => lead.status === "won");
  const lost = cohort.filter(lead => lead.status === "lost").length;
  const months: Array<{ month: string; newLeads: number }> = [];
  for (let month = monthOf(range.from); month <= through;) {
    months.push({ month, newLeads: 0 });
    const [year, monthNumber] = month.split("-").map(Number);
    month = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  }
  const byMonth = new Map(months.map(month => [month.month, month]));
  const sources = new Map<string, number>();
  let unknownCount = 0;
  for (const lead of cohort) {
    const month = byMonth.get(monthOf(getKyivDateOnly(new Date(lead.created_at))));
    if (month) month.newLeads += 1;
    const entered = lead.source?.trim();
    // Only established platform/source keys are case-normalized. Custom labels stay intact.
    const source = CRM_LEAD_SOURCE_KEYS.find(key => key === entered?.toLowerCase()) ?? entered;
    if (source) sources.set(source, (sources.get(source) ?? 0) + 1);
    else unknownCount += 1;
  }
  const days = won.flatMap(lead => {
    if (!lead.project_id || !validContactDate(lead.first_contact_date)) return [];
    const start = recordedProjectStart(lead.project_id, activities, through, tasks);
    if (!start || start.date < lead.first_contact_date) return [];
    return [Math.round((Date.parse(start.date) - Date.parse(lead.first_contact_date)) / DAY)];
  });
  return {
    from: range.from, through, asOf: today, months,
    cohort: {
      sample: cohort.length, won: won.length, lost, open: cohort.length - won.length - lost,
      successRate: cohort.length ? won.length / cohort.length : null,
      excludedInvalid: selected.length - cohort.length,
    },
    contactToStart: {
      ...timing(days), missing: won.length - days.length,
      linkedWon: won.filter(lead => lead.project_id !== null).length,
    },
    lifecycle: leadTimings(cohort, history, through),
    sources: {
      known: [...sources].map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
      knownCount: cohort.length - unknownCount, unknownCount,
    },
  };
}

export type CrmStatisticsReport = ReturnType<typeof buildCrmStatistics>;
