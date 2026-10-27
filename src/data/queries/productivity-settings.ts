import "server-only";

import { createClient } from "@/lib/supabase/server";
import { productivityStagePercentSchema } from "@/lib/productivity-settings";

export async function getStudioProductivityStagePercent(studioId: string): Promise<number> {
  const client = await createClient();
  const { data, error } = await client.from("studios").select("productivity_stage_1_percent").eq("id", studioId).single();
  const percent = productivityStagePercentSchema.safeParse(data?.productivity_stage_1_percent);
  if (error || !percent.success) throw new Error("Unable to load productivity stage shares.", { cause: error });
  return percent.data;
}
