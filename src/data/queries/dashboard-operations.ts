import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { addCalendarDays, zonedWallTimeToIso } from "@/lib/calendar";
import { CRM_INACTIVE_FOLLOW_UP_LEAD_STATUS } from "@/lib/crm";
import { getMaintenanceUrgency } from "@/lib/equipment";
import { isOfficeAssignmentOverdue, isTerminalOfficeAssignmentStatus } from "@/lib/office-assignments";
import { isTerminalSubmissionStatus } from "@/lib/submissions";
import type { SubmissionSummary } from "@/data/queries/submissions";
import type { DashboardOfficeAssignment } from "@/lib/dashboard";
import { financeDashboardMonthSummary } from "@/lib/finance-overview";
import { getFinanceOverview } from "./finance-overview";
import { getActiveCrmLeadCount } from "./crm";
import { FINANCE_OVERDUE_DB_FILTER } from "@/lib/finance-planning";
import { createClient } from "@/lib/supabase/server";

export type DashboardCrmFollowUp = { id: string; clientName: string; nextContactAt: string };
export type DashboardFinanceEvent = {
  id: string;
  date: string;
  description: string;
  direction: "incoming" | "outgoing";
  dueDate: string | null;
  obligationKind: string | null;
  projectName: string | null;
};

export type DashboardOperations = {
  crm: { activeCount: number; overdueCount: number; upcoming: DashboardCrmFollowUp[] };
  finance: null | { overdueReceivableCount: number; overdueObligationCount: number; upcoming: DashboardFinanceEvent[]; month: ReturnType<typeof financeDashboardMonthSummary> };
  office: { overdueAssignmentCount: number; myAssignments: DashboardOfficeAssignment[]; upcoming: Array<DashboardOfficeAssignment & { deadline: string }> };
  equipment: { overdueCount: number; upcoming: Array<{ id: string; title: string; date: string }> };
  submissions: { urgentCount: number };
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
  const [financeSettings, activeLeadCount, overdueFollowUps, upcomingFollowUps, assignmentsResult, equipmentResult, urgentSubmissionsResult] = await Promise.all([
    client.from("finance_settings").select("finalized_at").eq("studio_id", admin.studio_id).maybeSingle(),
    getActiveCrmLeadCount(),
    leadScope().lt("next_contact_at", nowIso).order("next_contact_at").limit(1),
    leadScope().gte("next_contact_at", nowIso).lt("next_contact_at", upcomingEndExclusive).order("next_contact_at"),
    client.from("office_assignments").select("id,title,deadline,priority,status,responsible_id").eq("studio_id", admin.studio_id).overrideTypes<Array<DashboardOfficeAssignment & { responsible_id: string }>, { merge: false }>(),
    client.from("equipment").select("id,display_name,asset_tag,recurring_maintenance_enabled,next_maintenance_due_date,lifecycle_state").eq("studio_id", admin.studio_id).neq("lifecycle_state", "retired"),
    client.from("submissions").select("id,type,status").eq("studio_id", admin.studio_id).eq("priority", "urgent").overrideTypes<Array<Pick<SubmissionSummary, "id" | "type" | "status">>, { merge: false }>(),
  ]);
  const queryError = financeSettings.error ?? overdueFollowUps.error ?? upcomingFollowUps.error ?? assignmentsResult.error ?? equipmentResult.error ?? urgentSubmissionsResult.error;
  if (queryError) throw new Error("Unable to load Dashboard operational signals.", { cause: queryError });

  const crm = {
    activeCount: activeLeadCount,
    overdueCount: overdueFollowUps.count ?? 0,
    upcoming: (upcomingFollowUps.data ?? []).flatMap((lead) => lead.next_contact_at
      ? [{ id: lead.id, clientName: lead.client_name, nextContactAt: lead.next_contact_at }]
      : []),
  };
  const submissions = { urgentCount: (urgentSubmissionsResult.data ?? []).filter((item) => !isTerminalSubmissionStatus(item.type, item.status)).length };
  const activeAssignments = (assignmentsResult.data ?? []).filter((item) => !isTerminalOfficeAssignmentStatus(item.status));
  const office = {
    overdueAssignmentCount: activeAssignments.filter((item) => isOfficeAssignmentOverdue(item.deadline, item.status, today)).length,
    myAssignments: activeAssignments.filter((item) => item.responsible_id === admin.authenticatedUserId).map(({ id, title, deadline, priority, status }) => ({ id, title, deadline, priority, status })),
    upcoming: activeAssignments.flatMap((item) => item.deadline && item.deadline > today && item.deadline <= addCalendarDays(today, 30) ? [{ id: item.id, title: item.title, deadline: item.deadline, priority: item.priority, status: item.status }] : []),
  };
  const maintenance = (equipmentResult.data ?? []).filter((item) => getMaintenanceUrgency(item.recurring_maintenance_enabled, item.next_maintenance_due_date, today));
  const equipment = {
    overdueCount: maintenance.filter((item) => getMaintenanceUrgency(item.recurring_maintenance_enabled, item.next_maintenance_due_date, today) === "overdue").length,
    upcoming: maintenance.flatMap((item) => item.next_maintenance_due_date && item.next_maintenance_due_date > today ? [{
      id: item.id, title: item.display_name ?? item.asset_tag, date: item.next_maintenance_due_date,
    }] : []),
  };
  if (!financeSettings.data?.finalized_at) return { crm, finance: null, office, equipment, submissions };

  const [incomingOverdue, outgoingOverdue] = await Promise.all([
    client.from("finance_expected_balances").select("id", { count: "exact", head: true }).eq("studio_id", admin.studio_id).eq("direction", "incoming").or(FINANCE_OVERDUE_DB_FILTER),
    client.from("finance_expected_balances").select("id", { count: "exact", head: true }).eq("studio_id", admin.studio_id).eq("direction", "outgoing").or(FINANCE_OVERDUE_DB_FILTER),
  ]);
  if (incomingOverdue.error || outgoingOverdue.error) throw new Error("Unable to load Dashboard overdue payments.", { cause: incomingOverdue.error ?? outgoingOverdue.error });
  const overview = await getFinanceOverview({ options: { horizon: "3", scenario: "confirmed" }, fx: [], invalidFx: false, period: "month" });
  if (!overview) throw new Error("Unable to load Dashboard Finance signals.");
  const projectIds = [...new Set(overview.forecast.items.flatMap((item) => item.projectId ? [item.projectId] : []))];
  const projects = projectIds.length ? await client.from("projects").select("id,name").eq("studio_id", admin.studio_id).in("id", projectIds) : null;
  if (projects?.error) throw new Error("Unable to load Dashboard payment projects.", { cause: projects.error });
  const projectNames = new Map(projects?.data?.map((project) => [project.id, project.name]));
  const upcoming = overview.forecast.items
    .filter((item) => item.date !== null && item.date >= overview.forecast.asOf && item.date <= overview.upcomingThrough && (item.dueDate === null || item.dueDate >= overview.forecast.asOf))
    .sort((left, right) => (left.date ?? "").localeCompare(right.date ?? "") || left.id.localeCompare(right.id))
    .map((item) => ({
      id: item.id,
      date: item.date ?? overview.forecast.asOf,
      description: item.description,
      direction: item.direction,
      dueDate: item.dueDate,
      obligationKind: item.obligationKind,
      projectName: item.projectId ? projectNames.get(item.projectId) ?? null : null,
    }));
  return {
    crm,
    finance: {
      overdueReceivableCount: incomingOverdue.count ?? 0,
      overdueObligationCount: outgoingOverdue.count ?? 0,
      upcoming,
      month: financeDashboardMonthSummary(overview),
    },
    office, equipment, submissions,
  };
}
