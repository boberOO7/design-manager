import "server-only";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { projectReportingSchema } from "@/lib/finance-profitability";

export async function getFinanceProjectCash(projectId?: string) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [report, projects, actionable] = await Promise.all([
    client.rpc("get_finance_project_reporting", { p_studio_id: admin.studio_id }),
    client.from("projects").select("id,name").eq("studio_id", admin.studio_id).order("name"),
    client.from("finance_actionable_unapplied").select("id,unapplied_amount::text").eq("studio_id", admin.studio_id).eq("direction", "incoming").order("id").range(0, 999),
  ]);
  if (report.error || projects.error || actionable.error) throw new Error("Unable to load project cash attribution.");
  const actionableIds = actionable.data ?? [];
  for (let offset = 1000; actionableIds.length === offset; offset += 1000) {
    const page = await client.from("finance_actionable_unapplied").select("id,unapplied_amount::text").eq("studio_id", admin.studio_id).eq("direction", "incoming").order("id").range(offset, offset + 999);
    if (page.error) throw new Error("Unable to load project cash availability.");
    actionableIds.push(...page.data);
  }
  const reporting = projectReportingSchema.parse(report.data);
  const settlementIds: string[] = [];
  if (projectId) for (let offset = 0; ; offset += 1000) {
    const page = await client.from("finance_project_payment_context").select("movement_id").eq("studio_id", admin.studio_id).eq("project_id", projectId).order("movement_id").range(offset, offset + 999);
    if (page.error) throw new Error("Unable to load project settlement context.");
    settlementIds.push(...page.data.flatMap(row => row.movement_id ? [row.movement_id] : []));
    if (page.data.length < 1000) break;
  }
  return { receipts: reporting.receipts, events: reporting.events, cashHistory: reporting.cashHistory, actionableIds: actionableIds.flatMap(item => item.id ? [item.id] : []), nativeUnapplied: Object.fromEntries(actionableIds.flatMap(item => item.id ? [[item.id, item.unapplied_amount]] : [])), settlementIds, projects: projects.data ?? [] };
}

export type FinanceProjectCash = NonNullable<Awaited<ReturnType<typeof getFinanceProjectCash>>>;
