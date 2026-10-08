import { scheduleAutomaticLabor } from "@/lib/finance-automatic-labor";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getReviewTimerSnapshot } from "@/data/queries/review-timers";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { reviewTimerInputSchema, reviewTimerSyncSchema } from "@/lib/review-timer";

export async function GET() {
  const snapshot = await getReviewTimerSnapshot();
  return snapshot ? NextResponse.json(snapshot) : NextResponse.json({ success: false }, { status: 403 });
}
export async function POST(request: Request) {
  const input = reviewTimerInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ success: false }, { status: 400 });
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return NextResponse.json({ success: false }, { status: 403 });
  const client = await createClient();
  const before = await client.rpc("sync_review_timer");
  if (before.error) return NextResponse.json({ success: false }, { status: 403 });
  const synced = reviewTimerSyncSchema.parse(before.data);
  if (synced.changed && synced.studioId) scheduleAutomaticLabor(synced.studioId);
  const { error } = await client.rpc("control_review_timer", { p_action: input.data.action, p_session_id: input.data.sessionId,
    ...(input.data.action === "start" ? { p_round_ids: input.data.roundIds } : {}) });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
  scheduleAutomaticLabor(access.membership.studio_id);
  for (const path of ["/my-tasks", "/statistics", `/team/${access.membership.authenticatedUserId}`]) revalidatePath(path);
  return NextResponse.json(await getReviewTimerSnapshot());
}
