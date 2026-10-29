import "server-only";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";

export async function getStudioDirectionPresets() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return [];
  const client = await createClient();
  const { data, error } = await client.from("studio_direction_presets").select("*").eq("studio_id", admin.studio_id);
  if (error) throw new Error("Unable to load work direction presets.", { cause: error });
  return data;
}
