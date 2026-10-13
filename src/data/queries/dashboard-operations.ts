import "server-only";
import { traceDashboardStage } from "@/lib/dashboard-trace";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { addCalendarDays, zonedWallTimeToIso } from "@/lib/calendar";
import { CRM_INACTIVE_FOLLOW_UP_LEAD_STATUS } from "@/lib/crm";
import { getMaintenanceUrgency } from "@/lib/equipment";
import { isOfficeAssignmentOverdue, isTerminalOfficeAssignmentStatus } from "@/lib/office-assignments";
import { isTerminalSubmissionStatus } from "@/lib/submissions";
import type { SubmissionSummary } from "@/data/queries/submissions";
import type { DashboardOfficeAssignment } from "@/lib/dashboard";
import { financeDashboardMonthSummary } from "@/lib/finance-overview";
import { getFinanceDisplayOverview, getFinanceDisplayRate, getFinanceDisplayUnit, getFinanceOverview } from "./finance-overview";
import { getFinanceDisplayCurrency } from "./finance-display-currency";
import { convertFinanceDisplayAmount } from "@/lib/finance-display-report";
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
  financeUnavailable: boolean;
  finance: null | { overdueReceivableCount: number; overdueObligationCount: number; upcoming: DashboardFinanceEvent[]; month: ReturnType<typeof financeDashboardMonthSummary> };
  office: { overdueAssignmentCount: number; myAssignments: DashboardOfficeAssignment[]; upcoming: Array<DashboardOfficeAssignment & { deadline: string }> };
  equipment: { overdueCount: number; upcoming: Array<{ id: string; title: string; date: string }> };
  submissions: { urgentCount: number };
};

export async function getDashboardOperations(today: string, now = new Date()): Promise<DashboardOperations | null> {
  const admin = await traceDashboardStage("operations.context", getActiveStudioAdmin);
  if (!admin) return null;
  const client = await createClient();
  const nowIso = now.toISOString();
  const upcomingEndExclusive = zonedWallTimeToIso(`${addCalendarDays(today, 30)}T00:00`);
  const leadScope = () => client.from("crm_leads").select("id, client_name, next_contact_at", { count: "exact" })
    .eq("studio_id", admin.studio_id)
    .eq("responsible_admin_id", admin.authenticatedUserId)
    .neq("status", CRM_INACTIVE_FOLLOW_UP_LEAD_STATUS)
    .not("next_contact_at", "is", null);
  const [finance, activeLeadCount, overdueFollowUps, upcomingFollowUps, assignmentsResult, equipmentResult, urgentSubmissionsResult] = await traceDashboardStage("operations.parallel_reads", () => Promise.all([
    traceDashboardStage("operations.finance", () => getDashboardFinance(client, admin.studio_id)),
    traceDashboardStage("operations.crm.active", getActiveCrmLeadCount),
    traceDashboardStage("operations.crm.overdue", () => leadScope().lt("next_contact_at", nowIso).order("next_contact_at").limit(1)),
    traceDashboardStage("operations.crm.upcoming", () => leadScope().gte("next_contact_at", nowIso).lt("next_contact_at", upcomingEndExclusive).order("next_contact_at")),
    traceDashboardStage("operations.office.assignments", () => client.from("office_assignments").select("id,title,deadline,priority,status,responsible_id").eq("studio_id", admin.studio_id).overrideTypes<Array<DashboardOfficeAssignment & { responsible_id: string }>, { merge: false }>()),
    traceDashboardStage("operations.office.equipment", () => client.from("equipment").select("id,display_name,asset_tag,recurring_maintenance_enabled,next_maintenance_due_date,lifecycle_state").eq("studio_id", admin.studio_id).neq("lifecycle_state", "retired")),
    traceDashboardStage("operations.office.submissions", () => client.from("submissions").select("id,type,status").eq("studio_id", admin.studio_id).eq("priority", "urgent").overrideTypes<Array<Pick<SubmissionSummary, "id" | "type" | "status">>, { merge: false }>()),
  ]));
  const queryError = overdueFollowUps.error ?? upcomingFollowUps.error ?? assignmentsResult.error ?? equipmentResult.error ?? urgentSubmissionsResult.error;
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
  return { crm, office, equipment, submissions, ...finance };
}

async function getDashboardFinance(client: Awaited<ReturnType<typeof createClient>>, studioId: string): Promise<Pick<DashboardOperations, "finance" | "financeUnavailable">> {
  try {
    const financeSettings = await traceDashboardStage("operations.finance.settings", () => client.from("finance_settings").select("finalized_at").eq("studio_id", studioId).maybeSingle());
    if (financeSettings.error) throw new Error("Unable to load Dashboard Finance settings.", { cause: financeSettings.error });
    if (!financeSettings.data?.finalized_at) return { finance: null, financeUnavailable: false };

    const [incomingOverdue, outgoingOverdue] = await traceDashboardStage("operations.finance.overdue_counts", () => Promise.all([
      client.from("finance_expected_balances").select("id", { count: "exact", head: true }).eq("studio_id", studioId).eq("direction", "incoming").or(FINANCE_OVERDUE_DB_FILTER),
      client.from("finance_expected_balances").select("id", { count: "exact", head: true }).eq("studio_id", studioId).eq("direction", "outgoing").or(FINANCE_OVERDUE_DB_FILTER),
    ]));
    if (incomingOverdue.error || outgoingOverdue.error) throw new Error("Unable to load Dashboard overdue payments.", { cause: incomingOverdue.error ?? outgoingOverdue.error });
    const [overview, displayCurrency] = await traceDashboardStage("operations.finance.overview_and_currency", () => Promise.all([traceDashboardStage("operations.finance.overview", () => getFinanceOverview({ options: { horizon: "3", scenario: "confirmed" }, fx: [], invalidFx: false, period: "month" })), traceDashboardStage("operations.finance.display_currency", getFinanceDisplayCurrency)]));
    if (!overview) throw new Error("Unable to load Dashboard Finance signals.");
    const projectIds = [...new Set(overview.forecast.items.flatMap((item) => item.projectId ? [item.projectId] : []))];
    // All these reads depend on the prepared overview, but not on one another.
    const [vatActuals, displayOverview, displayUnit, projects] = await Promise.all([
      traceDashboardStage("operations.finance.vat_actuals", () => client.from("finance_project_vat_actuals").select("financial_date,vat_reporting_amount::text")
        .eq("studio_id", studioId).gte("financial_date", `${overview.forecast.asOf.slice(0, 7)}-01`).lte("financial_date", overview.forecast.asOf)),
      traceDashboardStage("operations.finance.display_overview", () => getFinanceDisplayOverview(overview, displayCurrency)),
      traceDashboardStage("operations.finance.display_unit", () => getFinanceDisplayUnit(displayCurrency)),
      projectIds.length ? traceDashboardStage("operations.finance.projects", () => client.from("projects").select("id,name").eq("studio_id", studioId).in("id", projectIds)) : null,
    ]);
    if (vatActuals.error) throw new Error("Unable to load project VAT actuals.", { cause: vatActuals.error });
    if (!displayOverview) throw new Error("Unable to display Dashboard Finance signals.");
    if (projects?.error) throw new Error("Unable to load Dashboard payment projects.", { cause: projects.error });
    const vatAdjustments = await traceDashboardStage("operations.finance.vat_fx", () => Promise.all((vatActuals.data ?? []).map(async row => ({
      date: row.financial_date ?? "",
      amount: row.vat_reporting_amount === null || displayCurrency === overview.forecast.currency ? row.vat_reporting_amount : convertFinanceDisplayAmount(
        row.vat_reporting_amount,
        await getFinanceDisplayRate(overview.forecast.currency, displayCurrency, row.financial_date ?? overview.forecast.asOf),
        displayUnit,
      ),
    }))));
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
      financeUnavailable: false,
      finance: {
        overdueReceivableCount: incomingOverdue.count ?? 0,
        overdueObligationCount: outgoingOverdue.count ?? 0,
        upcoming,
        month: await traceDashboardStage("operations.finance.month_summary", () => financeDashboardMonthSummary({ ...displayOverview, vatAdjustments })),
      },
    };
  } catch (cause) {
    console.error("Dashboard Finance data is unavailable.", cause);
    return { finance: null, financeUnavailable: true };
  }
}
