"use server";

import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { scheduleAutomaticLabor } from "@/lib/finance-automatic-labor";

export async function saveStandardWorkday(minutes: number): Promise<boolean> {
  const input = z.number().int().positive().max(2147483647).safeParse(minutes);
  if (!input.success) return false;
  const admin = await getActiveStudioAdmin();
  if (!admin) return false;
  const client = await createClient();
  const { error } = await client.rpc("set_standard_workday_minutes", { p_studio_id: admin.studio_id, p_minutes: input.data });
  if (error) return false;
  scheduleAutomaticLabor(admin.studio_id);
  return true;
}
