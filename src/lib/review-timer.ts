import { z } from "zod";
import { TASK_STAGES } from "./task-stages";

export const reviewTimerInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), sessionId: z.uuid(), roundIds: z.array(z.uuid()).min(1).refine(ids => new Set(ids).size === ids.length) }),
  z.object({ action: z.literal("pause"), sessionId: z.uuid() }),
]);
export const reviewTimerSyncSchema = z.object({ sessionId: z.uuid().nullable(), changed: z.boolean(), studioId: z.uuid().nullable() });
export const reviewTimerSnapshotSchema = z.object({
  serverNow: z.string(), userId: z.uuid(),
  activeReview: z.object({ roundId: z.uuid(), projectId: z.uuid(), projectName: z.string(), taskTitle: z.string(), stage: z.enum(TASK_STAGES), stageName: z.string().nullable() }).nullable().optional(),
  sessions: z.array(z.object({ id: z.uuid(), user_id: z.uuid(), state: z.enum(["active", "paused", "completed"]),
    started_at: z.string(), accounted_at: z.string().nullable(), elapsed_us: z.number().nonnegative(),
    members: z.array(z.object({ round_id: z.uuid(), finished_at: z.string().nullable() })) })),
});
export type ReviewTimerSnapshot = z.infer<typeof reviewTimerSnapshotSchema>;
export type ReviewTimerSession = ReviewTimerSnapshot["sessions"][number];

export function currentReviewTimerSession(snapshot: ReviewTimerSnapshot | null) {
  const own = snapshot?.sessions.filter(session => session.user_id === snapshot.userId) ?? [];
  const active = own.find(session => session.state === "active");
  if (active) return active;
  // A finalized latest session dismisses the island instead of reviving older paused work.
  const latest = [...own].sort((a, b) => b.started_at.localeCompare(a.started_at) || a.id.localeCompare(b.id))[0];
  return latest?.state === "paused" && latest.members.some(member => !member.finished_at) ? latest : undefined;
}

export function reviewSessionElapsed(session: ReviewTimerSession, serverNow: number) {
  return session.elapsed_us / 1_000_000 + (session.state === "active" && session.accounted_at
    ? Math.max(0, serverNow - Date.parse(session.accounted_at)) / 1000 : 0);
}
export function reviewGroupElapsed(snapshot: ReviewTimerSnapshot | null, session: ReviewTimerSession, serverNow: number) {
  const key = session.members.map(member => member.round_id).sort().join(",");
  return (snapshot?.sessions ?? [session]).filter(previous => previous.user_id === session.user_id
    && previous.members.map(member => member.round_id).sort().join(",") === key)
    .reduce((sum, previous) => sum + reviewSessionElapsed(previous, serverNow), 0);
}
export function reviewTimerForRound(snapshot: ReviewTimerSnapshot | null, roundId: string, reviewerId: string, serverNow: number) {
  const sessions = snapshot?.sessions.filter(session => session.user_id === reviewerId && session.members.some(member => member.round_id === roundId)) ?? [];
  const latest = [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  const member = latest?.members.find(row => row.round_id === roundId);
  return {
    state: member?.finished_at ? "completed" as const : latest?.state === "active" ? "active" as const : latest ? "paused" as const : "waiting" as const,
    session: latest,
    seconds: sessions.reduce((sum, session) => sum + reviewSessionElapsed(session, serverNow) / session.members.length, 0),
  };
}
export function formatReviewElapsed(seconds: number) {
  const total = Math.floor(Math.max(0, seconds));
  return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor(total / 60) % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
