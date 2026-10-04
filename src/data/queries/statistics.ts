import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getCanonicalProductivityAttributions } from "@/data/queries/productivity-attributions";
import { createClient } from "@/lib/supabase/server";
import { buildStatistics, type StatisticsPeriod } from "@/lib/statistics";
import { getKyivDateOnly } from "@/lib/validation/project";

/** Page each independent source, with stable ordering, past PostgREST's 1,000
 * row cap. No per-project/person queries and no Finance occurrence writes.
 */
async function readPages<T>(page: (offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await page(offset);
    if (result.error || !result.data) throw new Error("Unable to load Statistics.", { cause: result.error });
    rows.push(...result.data);
    if (result.data.length < 1000) return rows;
  }
}

export async function getStatistics(period: StatisticsPeriod, today = getKyivDateOnly()) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const studio = admin.studio_id;
  const [projects, tasks, activities, attributions, payroll, unknownCosts, payCoverage] = await Promise.all([
    readPages(offset => client.from("projects").select("id,name,status,archived_at,completed_at,include_in_productivity,total_area_m2")
      .eq("studio_id", studio).order("id").range(offset, offset + 999)),
    readPages(offset => client.from("tasks").select("id,project_id,completed_at,project:projects!inner(studio_id)").eq("project.studio_id", studio)
      .eq("status", "completed").not("completed_at", "is", null).lte("completed_at", today).order("id").range(offset, offset + 999)),
    readPages(offset => client.from("project_activity").select("project_id,changes,created_at").eq("studio_id", studio)
      .eq("entity_type", "project").order("created_at").order("id").range(offset, offset + 999)),
    getCanonicalProductivityAttributions(studio),
    readPages(offset => client.from("finance_obligations").select("id,schedule_id,period_start,period_end,terms:finance_schedule_terms!finance_obligations_studio_id_terms_id_schedule_id_fkey(currency,employee_deductions,employer_cost,employer_cost_status),items:finance_obligation_items!finance_obligation_items_studio_id_obligation_id_fkey(component,managed_active,expected:finance_expected_items!finance_obligation_items_studio_id_expected_item_id_fkey(amount::text,currency,certainty,commitment))")
      .eq("studio_id", studio).eq("kind", "payroll").lt("period_end", `${today.slice(0, 7)}-01`).order("id").range(offset, offset + 999)),
    readPages(offset => client.from("finance_payroll_unknown_costs").select("obligation_id,component,status,amount::text")
      .eq("studio_id", studio).order("obligation_id").order("component").range(offset, offset + 999)),
    readPages(offset => client.from("finance_schedule_history").select("schedule_id,effective_from,valid_through,schedule:finance_schedules!inner(kind)")
      .eq("studio_id", studio).eq("schedule.kind", "payroll").order("id").range(offset, offset + 999)),
  ]);
  // Only aggregate report data crosses the Server Component boundary. Employee
  // identities, individual salaries and raw obligations remain server-only.
  return buildStatistics({ projects, tasks, activities, attributions, payroll, unknownCosts, payCoverage }, period, today);
}
