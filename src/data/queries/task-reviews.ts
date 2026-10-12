import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getAssignableProjectMembers } from "@/data/queries/project-members";
import { createClient } from "@/lib/supabase/server";
import { loadAllRows } from "./all-rows";

export async function getTaskReviewCandidates(taskId: string) {
  const membership = await getActiveStudioAdmin();
  if (!membership) return null;
  const supabase = await createClient();
  const { data: task, error } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (error) throw new Error("Unable to load task review settings.", { cause: error });
  if (!task) return null;
  const [members, admins] = await Promise.all([
    getAssignableProjectMembers(task.project_id, membership.studio_id),
    supabase.from("studio_members").select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url, is_active)")
      .eq("studio_id", membership.studio_id).eq("system_role", "admin").eq("is_active", true).eq("profile.is_active", true),
  ]);
  if (admins.error) throw new Error("Unable to load reviewers.", { cause: admins.error });
  return [...new Map([...members, ...(admins.data ?? []).map(({ profile }) => profile)].map((member) => [member.id, member])).values()]
    .sort((left, right) => left.full_name.localeCompare(right.full_name));
}

export async function getTaskReviewQueue() {
  const resolution = await resolveActiveStudioMembership();
  if (resolution.status !== "ACTIVE_STUDIO") return [];
  const membership = resolution.membership;
  const supabase = await createClient();
  const { data, error } = await loadAllRows((from, to) => {
    const query = supabase.from("task_review_rounds")
      .select("id, round_number, reviewer_id, submitted_at, task:tasks!inner(id, title, stage, status, priority, assignee:profiles!tasks_assignee_id_fkey(full_name,avatar_url), project:projects!tasks_project_id_fkey!inner(id, name, status, archived_at)), reviewer:profiles!task_review_rounds_reviewer_id_fkey(full_name)")
      .eq("reviewer_id", membership.authenticatedUserId)
      .is("completed_at", null).eq("task.status", "internal_review").is("task.project.archived_at", null)
      .order("submitted_at").order("id").range(from, to);
    return query;
  });
  if (error) throw new Error("Unable to load the review queue.", { cause: error });
  return (data ?? []).filter((round) => round.task.project.status !== "completed" || round.task.stage === "stage_4");
}
export type TaskReviewQueueItem = Awaited<ReturnType<typeof getTaskReviewQueue>>[number];
