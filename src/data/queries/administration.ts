import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getRequiredTimeOffApprovalCount, getUpcomingEndDate, isUpcomingAbsence, sortPendingRequests, sortRecentDecisions, sortUpcomingAbsences, type AdministrationModel, type AdministrationRequest } from "@/lib/administration";
import { instantToDateOnly } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { getStudioChecklistTemplates } from "@/data/queries/checklist-templates";

export async function getAdministrationData(): Promise<AdministrationModel | null> {
  const membership = await getActiveStudioAdmin();
  if (!membership) return null;
  const supabase = await createClient();
  const today = instantToDateOnly(new Date().toISOString());
  const upcomingEnd = getUpcomingEndDate(today);
  const select = "id, request_type, start_date, end_date, start_time, end_time, all_day, private_note, review_note, status, created_at, reviewed_at, cancelled_at, employee:profiles!time_off_requests_user_id_fkey!inner(full_name, job_title), reviewer:profiles!time_off_requests_reviewed_by_fkey(full_name), approvals:time_off_request_approvals(admin_user_id)";
  const pendingPromise = supabase.from("time_off_requests").select(select).eq("studio_id", membership.studio_id).eq("status", "pending").order("created_at").limit(50);
  const upcomingPromise = supabase.from("time_off_requests").select(select).eq("studio_id", membership.studio_id).eq("status", "approved").is("cancelled_at", null).lte("start_date", upcomingEnd).gte("end_date", today).order("start_date").limit(50);
  const recentPromise = supabase.from("time_off_requests").select(select).eq("studio_id", membership.studio_id).in("status", ["approved", "rejected", "cancelled"]).order("updated_at", { ascending: false }).limit(20);
  const membersPromise = supabase.from("studio_members").select("is_active, system_role").eq("studio_id", membership.studio_id).limit(500);
  const [pendingResult, upcomingResult, recentResult, membersResult, checklistTemplates] = await Promise.all([pendingPromise, upcomingPromise, recentPromise, membersPromise, getStudioChecklistTemplates({ includeArchived: true })]);
  const error = [pendingResult.error, upcomingResult.error, recentResult.error, membersResult.error].find(Boolean);
  if (error) throw new Error("Unable to load Administration data.", { cause: error });
  const mapRequest = (row: NonNullable<typeof pendingResult.data>[number]): AdministrationRequest => ({
    id: row.id, employeeName: row.employee.full_name, employeeRole: row.employee.job_title, requestType: row.request_type,
    startDate: row.start_date, endDate: row.end_date, startTime: row.start_time, endTime: row.end_time, allDay: row.all_day,
    privateNote: row.private_note, reviewNote: row.review_note, status: row.status, createdAt: row.created_at,
    reviewedAt: row.reviewed_at, cancelledAt: row.cancelled_at, reviewerName: row.reviewer?.full_name ?? null,
    approvalCount: row.approvals.length, requiredApprovalCount: getRequiredTimeOffApprovalCount(row.request_type), hasCurrentAdminApproved: row.approvals.some((approval) => approval.admin_user_id === membership.authenticatedUserId),
  });
  const pendingRequests = sortPendingRequests((pendingResult.data ?? []).map(mapRequest));
  const upcomingAbsences = sortUpcomingAbsences((upcomingResult.data ?? []).map(mapRequest).filter((request) => isUpcomingAbsence(request, today, upcomingEnd)));
  const recentDecisions = sortRecentDecisions((recentResult.data ?? []).map(mapRequest)).slice(0, 10);
  const members = membersResult.data ?? [];
  return { studioId: membership.studio_id, checklistTemplates, today, upcomingEnd, pendingRequests, upcomingAbsences, recentDecisions, team: { activeMembers: members.filter((member) => member.is_active).length, administrators: members.filter((member) => member.is_active && member.system_role === "admin").length, inactiveMembers: members.filter((member) => !member.is_active).length } };
}
