import "server-only";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { projectReportingSchema } from "@/lib/finance-profitability";

export async function getFinanceProjectCash() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [report, projects] = await Promise.all([
    client.rpc("get_finance_project_reporting", { p_studio_id: admin.studio_id }),
    client.from("projects").select("id,name").eq("studio_id", admin.studio_id).order("name"),
  ]);
  if (report.error || projects.error) throw new Error("Unable to load project cash attribution.");
  return { receipts: projectReportingSchema.parse(report.data).receipts, projects: projects.data ?? [] };
}

export type FinanceProjectCash = NonNullable<Awaited<ReturnType<typeof getFinanceProjectCash>>>;
