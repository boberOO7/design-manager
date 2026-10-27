import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveStudioMembership } from "./active-studio-membership";
import { loadAllRows } from "./all-rows";
import { currentReviewTimerSession, reviewTimerSnapshotSchema, reviewTimerSyncSchema, type ReviewTimerSnapshot } from "@/lib/review-timer";
import { getMyTaskStageNames } from "./tasks";

export async function getReviewTimerSnapshot() {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return null;
  const client = await createClient();
  const sync = await client.rpc("sync_review_timer");
  if (sync.error) throw new Error("Unable to synchronize review timer.", { cause: sync.error });
  reviewTimerSyncSchema.parse(sync.data);
  const sessions = await loadAllRows((from, to) => client.from("review_timer_sessions")
    .select("id,user_id,state,started_at,accounted_at,elapsed_us,members:review_timer_members(round_id,finished_at)")
    .eq("studio_id", access.membership.studio_id).order("started_at", { ascending: false }).order("id").range(from, to));
  if (sessions.error) throw new Error("Unable to load review timers.", { cause: sessions.error });
  const snapshot = reviewTimerSnapshotSchema.parse({ serverNow: new Date().toISOString(), userId: access.membership.authenticatedUserId, sessions: sessions.data ?? [] });
  const current = currentReviewTimerSession(snapshot);
  const roundId = current?.members.find(member => !member.finished_at)?.round_id;
  let activeReview: ReviewTimerSnapshot["activeReview"] = null;
  if (roundId) {
    const { data: round, error } = await client.from("task_review_rounds")
      .select("id,task:tasks!inner(title,stage,project:projects!tasks_project_id_fkey!inner(id,name))").eq("id", roundId)
      .eq("reviewer_id", snapshot.userId).is("completed_at", null).eq("task.status", "internal_review").maybeSingle();
    if (error) throw new Error("Unable to load active review context.", { cause: error });
    if (round) {
      const names = await getMyTaskStageNames([round.task.project.id]);
      activeReview = reviewTimerSnapshotSchema.shape.activeReview.parse({ roundId: round.id, projectId: round.task.project.id, projectName: round.task.project.name,
        taskTitle: round.task.title, stage: round.task.stage, stageName: names[`${round.task.project.id}:${round.task.stage}`] ?? null });
    }
  }
  return reviewTimerSnapshotSchema.parse({ ...snapshot, serverNow: new Date().toISOString(), activeReview });
}
