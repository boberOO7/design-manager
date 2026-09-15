import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import type { SubmissionItem, SubmissionPerson } from "@/data/queries/submissions";
import type { OfficeAssignmentItem } from "@/data/queries/office-assignments";
import { isOfficeAssignmentOverdue, isTerminalOfficeAssignmentStatus } from "@/lib/office-assignments";
import { isTerminalSubmissionStatus } from "@/lib/submissions";
import { instantToDateOnly } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";

type SubmissionSummaryRow = Pick<SubmissionItem, "id" | "type" | "status"> & { updated_at: string; author: { id: string } | null };
type AssignmentSummaryRow = Pick<OfficeAssignmentItem, "id" | "status" | "deadline"> & { updated_at: string; responsible: { profile: { id: string } } };
type Activity = { id: string; title: string; kind: "submission" | "assignment"; person: SubmissionPerson | null; anonymous: boolean };
const person = (row: { id: string; full_name: string; avatar_url: string | null }): SubmissionPerson => ({ id: row.id, fullName: row.full_name, avatarUrl: row.avatar_url });

export async function getOfficeOverview() {
  const membership = await getActiveStudioMembership();
  if (!membership) throw new Error("An active studio membership is required to load Office.");
  const supabase = await createClient();
  const isAdmin = membership.system_role === "admin";
  const today = instantToDateOnly(new Date().toISOString());
  const [submissions, assignments] = await Promise.all([
    // Preserve the workspaces' RLS joins, created ordering and Data API population cap.
    // ponytail: counts scan lightweight rows; revisit with workspace pagination if this cap changes.
    supabase.from("submissions").select("id, type, status, updated_at, author:profiles!submissions_author_id_fkey(id)")
      .eq("studio_id", membership.studio_id).order("created_at", { ascending: false }).overrideTypes<SubmissionSummaryRow[], { merge: false }>(),
    supabase.from("office_assignments").select("id, status, deadline, updated_at, responsible:studio_members!office_assignments_studio_id_responsible_id_fkey(profile:profiles!studio_members_user_id_fkey(id))")
      .eq("studio_id", membership.studio_id).order("created_at", { ascending: false }).overrideTypes<AssignmentSummaryRow[], { merge: false }>(),
  ]);
  if (submissions.error || assignments.error) throw new Error("Unable to load Office summary.", { cause: submissions.error ?? assignments.error });
  const ownSubmissions = submissions.data.filter((item) => item.author?.id === membership.authenticatedUserId);
  const activeAssignments = assignments.data.filter((item) => !isTerminalOfficeAssignmentStatus(item.status));
  const recent = [
    ...(isAdmin ? submissions.data : ownSubmissions).map((item) => ({ id: item.id, updatedAt: item.updated_at, kind: "submission" as const })),
    ...assignments.data.map((item) => ({ id: item.id, updatedAt: item.updated_at, kind: "assignment" as const })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const submissionIds = recent.filter((item) => item.kind === "submission").map((item) => item.id);
  const assignmentIds = recent.filter((item) => item.kind === "assignment").map((item) => item.id);
  const [recentSubmissions, recentAssignments] = await Promise.all([
    submissionIds.length ? supabase.from("submissions").select("id, title, is_anonymous, author:profiles!submissions_author_id_fkey(id, full_name, avatar_url)")
      .eq("studio_id", membership.studio_id).in("id", submissionIds) : Promise.resolve({ data: [], error: null }),
    assignmentIds.length ? supabase.from("office_assignments").select("id, title, responsible:studio_members!office_assignments_studio_id_responsible_id_fkey(profile:profiles!studio_members_user_id_fkey(id, full_name, avatar_url))")
      .eq("studio_id", membership.studio_id).in("id", assignmentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (recentSubmissions.error || recentAssignments.error) throw new Error("Unable to load Office activity.", { cause: recentSubmissions.error ?? recentAssignments.error });
  const activity = new Map<string, Activity>([
    ...recentSubmissions.data.map((item): [string, Activity] => [`submission:${item.id}`, { id: item.id, title: item.title, kind: "submission", person: item.is_anonymous || !item.author ? null : person(item.author), anonymous: item.is_anonymous }]),
    ...recentAssignments.data.map((item): [string, Activity] => [`assignment:${item.id}`, { id: item.id, title: item.title, kind: "assignment", person: item.responsible?.profile ? person(item.responsible.profile) : null, anonymous: false }]),
  ]);
  return {
    isAdmin,
    counts: {
      ownSubmissions: ownSubmissions.length,
      attention: submissions.data.filter((item) => !isTerminalSubmissionStatus(item.type, item.status)).length,
      activeAssignments: activeAssignments.length,
      assignedToMe: activeAssignments.filter((item) => item.responsible.profile.id === membership.authenticatedUserId).length,
      overdueAssignments: assignments.data.filter((item) => isOfficeAssignmentOverdue(item.deadline, item.status, today)).length,
    },
    recent: recent.flatMap((item) => { const value = activity.get(`${item.kind}:${item.id}`); return value ? [value] : []; }),
  };
}
