import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { DEFAULT_WORKDAY_MINUTES } from "@/lib/time-off-compensation";

export async function getStatisticsWorkday(client: Awaited<ReturnType<typeof createClient>>, studio: string, today: string) {
  // Match Administration, including effective revisions not yet mirrored to studios.
  const [setting, capacity] = await Promise.all([
    client.from("studios").select("standard_workday_minutes").eq("id", studio).single(),
    client.from("finance_labor_capacity_revisions").select("daily_minutes")
      .eq("studio_id", studio).is("employee_id", null).lte("effective_from", today)
      .order("effective_from", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (setting.error || capacity.error) throw new Error("Unable to load Statistics workday.", { cause: setting.error ?? capacity.error });
  return capacity.data?.daily_minutes ?? setting.data?.standard_workday_minutes ?? DEFAULT_WORKDAY_MINUTES;
}
