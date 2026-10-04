import type { Database } from "@/types/database.types";
import { median, recordedProjectStart, type StatisticsActivity, type StatisticsTask } from "@/lib/statistics";
import { getKyivDateOnly } from "@/lib/validation/project";

export type StatisticsLead = Pick<Database["public"]["Tables"]["crm_leads"]["Row"],
  "id" | "created_at" | "first_contact_date" | "status" | "invalid_reason" | "project_id" | "source">;

const DAY = 86_400_000;
const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

function validContactDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
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
    const source = lead.source?.trim();
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
      medianDays: median(days), sample: days.length, missing: won.length - days.length,
      linkedWon: won.filter(lead => lead.project_id !== null).length,
    },
    sources: {
      known: [...sources].map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
      knownCount: cohort.length - unknownCount, unknownCount,
    },
  };
}

export type CrmStatisticsReport = ReturnType<typeof buildCrmStatistics>;
