import "server-only";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { laborDataSchema } from "@/lib/finance-labor";

export async function getFinanceLabor() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const { data, error } = await client.rpc("get_finance_labor_reporting", { p_studio_id: admin.studio_id });
  if (error) throw new Error("Unable to load confirmed labor cost.", { cause: error });
  return laborDataSchema.parse(data);
}
