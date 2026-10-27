"use server";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { productivityStagePercentSchema } from "@/lib/productivity-settings";

export async function saveProductivityStageShares(percent: number): Promise<boolean> {
  const input = productivityStagePercentSchema.safeParse(percent);
  if (!input.success) return false;
  const admin = await getActiveStudioAdmin();
  if (!admin) return false;
  const client = await createClient();
  const { error } = await client.rpc("save_productivity_stage_shares", { p_studio_id: admin.studio_id, p_stage_1_percent: input.data });
  if (error) return false;
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  revalidatePath("/team/[userId]", "page");
  return true;
}
