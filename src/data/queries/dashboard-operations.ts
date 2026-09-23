import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { addCalendarDays, zonedWallTimeToIso } from "@/lib/calendar";
import { CRM_INACTIVE_FOLLOW_UP_LEAD_STATUS } from "@/lib/crm";
import { financeOverviewSchema } from "@/lib/finance-overview";
import { createClient } from "@/lib/supabase/server";

export type DashboardCrmFollowUp = { id: string; clientName: string; nextContactAt: string };
export type DashboardFinanceEvent = {
  id: string;
  date: string;
  description: string;
  direction: "incoming" | "outgoing";
  dueDate: string | null;
  obligationKind: string | null;
};

export type DashboardOperations = {
  crm: { overdueCount: number; upcoming: DashboardCrmFollowUp[] };
  finance: null | { overdueReceivableCount: number; overdueObligationCount: number; upcoming: DashboardFinanceEvent[] };
};

export async function getDashboardOperations(today: string, now = new Date()): Promise<DashboardOperations | null> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const nowIso = now.toISOString();
  const upcomingEndExclusive = zonedWallTimeToIso(`${addCalendarDays(today, 30)}T00:00`);
  const leadScope = () => client.from("crm_leads").select("id, client_name, next_contact_at", { count: "exact" })
    .eq("studio_id", admin.studio_id)
    .eq("responsible_admin_id", admin.authenticatedUserId)
    .neq("status", CRM_INACTIVE_FOLLOW_UP_LEAD_STATUS)
    .not("next_contact_at", "is", null);
  const [financeSettings, overdueFollowUps, upcomingFollowUps] = await Promise.all([
    client.from("finance_settings").select("finalized_at").eq("studio_id", admin.studio_id).maybeSingle(),
    leadScope().lt("next_contact_at", nowIso).order("next_contact_at").limit(1),
    leadScope().gte("next_contact_at", nowIso).lt("next_contact_at", upcomingEndExclusive).order("next_contact_at").limit(20),
  ]);
  const queryError = financeSettings.error ?? overdueFollowUps.error ?? upcomingFollowUps.error;
  if (queryError) throw new Error("Unable to load Dashboard operational signals.", { cause: queryError });

  const crm = {
    overdueCount: overdueFollowUps.count ?? 0,
    upcoming: (upcomingFollowUps.data ?? []).flatMap((lead) => lead.next_contact_at
      ? [{ id: lead.id, clientName: lead.client_name, nextContactAt: lead.next_contact_at }]
      : []),
  };
  if (!financeSettings.data?.finalized_at) return { crm, finance: null };

  const raw = await client.rpc("get_finance_overview", {
    p_studio_id: admin.studio_id,
    p_horizon: "3",
    p_scenario: "confirmed",
    p_fx: [],
    p_period: "month",
  });
  if (raw.error) throw new Error("Unable to load Dashboard Finance signals.", { cause: raw.error });
  const overview = financeOverviewSchema.parse(raw.data);
  const overdue = overview.forecast.items.filter((item) => item.dueDate !== null && item.dueDate < overview.forecast.asOf);
  const upcoming = overview.forecast.items
    .filter((item) => item.date !== null && item.date >= overview.forecast.asOf && item.date <= overview.upcomingThrough)
    .sort((left, right) => (left.date ?? "").localeCompare(right.date ?? "") || left.id.localeCompare(right.id))
    .map((item) => ({
      id: item.id,
      date: item.date ?? overview.forecast.asOf,
      description: item.description,
      direction: item.direction,
      dueDate: item.dueDate,
      obligationKind: item.obligationKind,
    }));
  return {
    crm,
    finance: {
      overdueReceivableCount: overdue.filter((item) => item.direction === "incoming").length,
      overdueObligationCount: overdue.filter((item) => item.direction === "outgoing").length,
      upcoming,
    },
  };
}
