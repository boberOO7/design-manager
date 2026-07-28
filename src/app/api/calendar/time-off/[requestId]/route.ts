import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getNormalizedTimeOffRequest } from "@/data/queries/calendar-item";
import { canTransitionTimeOff } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { calendarFieldErrors, timeOffActionSchema } from "@/lib/validation/calendar";
import type { TimeOffStatus } from "@/types/calendar";

type Context = { params: Promise<{ requestId: string }> };

export async function PATCH(request: Request, context: Context) {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, formError: "Authentication is required." }, { status: 401 });
  const { requestId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = timeOffActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("time_off_requests").select("id, user_id, status").eq("id", requestId).eq("studio_id", membership.studio_id).maybeSingle();
  if (readError || !existing) return NextResponse.json({ success: false, formError: "The request was not found." }, { status: 404 });
  const role = membership.system_role === "admin" ? "admin" : "employee";
  const nextStatus: TimeOffStatus = parsed.data.action === "approve" ? "approved" : parsed.data.action === "reject" ? "rejected" : "cancelled";
  if ((role === "employee" && existing.user_id !== membership.authenticatedUserId) || !canTransitionTimeOff(existing.status as TimeOffStatus, nextStatus, role)) {
    return NextResponse.json({ success: false, formError: "This time-off action is not allowed." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const update = nextStatus === "cancelled"
    ? { status: nextStatus, cancelled_at: now }
    : { status: nextStatus, reviewed_by: membership.authenticatedUserId, reviewed_at: now, review_note: parsed.data.reviewNote };
  const { error } = await supabase.from("time_off_requests").update(update).eq("id", requestId).eq("studio_id", membership.studio_id);
  if (error) return NextResponse.json({ success: false, formError: "The request could not be updated." }, { status: 400 });
  const item = await getNormalizedTimeOffRequest(requestId, membership.authenticatedUserId);
  return NextResponse.json({ success: true, item, removedKey: item ? null : `time_off_request_admin:${requestId}` });
}
