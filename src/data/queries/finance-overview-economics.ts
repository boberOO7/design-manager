import "server-only";
import { z } from "zod";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { getFinanceManagement } from "./finance-management";
import { createClient } from "@/lib/supabase/server";
import { buildOverviewProjectEconomics, type OverviewProjectMetadata } from "@/lib/finance-overview-economics";

const metadataSchema = z.object({ id: z.uuid(), status: z.string(), total_area_m2: z.string().regex(/^-?\d+(?:\.\d{1,4})?$/).nullable() });

export async function getFinanceOverviewProjectEconomics() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const metadata: OverviewProjectMetadata[] = [];
  const data = await getFinanceManagement({});
  if (!data) return null;
  for (let offset = 0; ; offset += 1000) {
    const page = await client.from("projects").select("id,status,total_area_m2::text").eq("studio_id", admin.studio_id).order("id").range(offset, offset + 999);
    if (page.error || !page.data) throw new Error("Unable to load project economics metadata.", { cause: page.error });
    metadata.push(...z.array(metadataSchema).parse(page.data).map(project => ({ id: project.id, status: project.status, area: project.total_area_m2 })));
    if (page.data.length < 1000) break;
  }
  return { currency: data.currency, asOf: data.today,
    ...buildOverviewProjectEconomics(data.projectProfitability, metadata, data.labor.automation?.internalProjectId ?? null, data.currency.minor_units, {
      rows: data.projectRows, recorded: [],
      provisional: data.provisionalLabor, historical: data.historicalProjectLabor, pendingExpenses: data.provisional.filter(row => row.classification === "direct_cost"), recognitionStart: data.settings?.recognition_start_month ?? null,
      laborConfigured: Boolean(data.labor.automation), today: data.today, coverage: data.coverage,
    }) };
}
