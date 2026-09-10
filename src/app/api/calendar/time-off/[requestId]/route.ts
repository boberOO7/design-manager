import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getNormalizedTimeOffRequest } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";
import { deriveTimeOffUpdate, timeOffUpdateFields } from "@/lib/time-off-request";
import { calendarFieldErrors, timeOffActionSchema } from "@/lib/validation/calendar";

type Context = { params: Promise<{ requestId: string }> };

export async function PATCH(request: Request, context: Context) {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, formError: "Authentication is required." }, { status: 401 });
  if (membership.system_role !== "admin" && membership.system_role !== "employee") return NextResponse.json({ success: false, formError: "Authentication is required." }, { status: 401 });
  const { requestId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = timeOffActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("time_off_requests").select("id, user_id, status").eq("id", requestId).eq("studio_id", membership.studio_id).maybeSingle();
  if (readError || !existing) return NextResponse.json({ success: false, formError: "The request was not found." }, { status: 404 });

  if (parsed.data.action === "approve") {
    if (membership.system_role !== "admin") return NextResponse.json({ success: false, formError: "This time-off action is not allowed." }, { status: 403 });
    const { data: approval, error: approvalError } = await supabase.rpc("approve_time_off_request", {
      p_request_id: requestId,
      p_review_note: parsed.data.reviewNote ?? undefined,
    });
    if (approvalError || !approval?.[0]) {
      const postgresContext = approvalError && "context" in approvalError && typeof approvalError.context === "string" ? approvalError.context : null;
      const postgresWhere = approvalError && "where" in approvalError && typeof approvalError.where === "string" ? approvalError.where : null;
      console.error("time_off_requests approval failed", {
        error: approvalError ? { code: approvalError.code, message: approvalError.message, details: approvalError.details, hint: approvalError.hint, context: postgresContext, where: postgresWhere } : null,
        approvalReturnedRow: Boolean(approval?.[0]),
        requestId,
        studioId: membership.studio_id,
        authenticatedUserId: membership.authenticatedUserId,
        reviewNotePresent: parsed.data.reviewNote !== null,
      });
      return NextResponse.json({ success: false, formError: "The request could not be approved." }, { status: approvalError?.code === "P0001" ? 400 : 500 });
    }
    const item = await getNormalizedTimeOffRequest(requestId, membership.authenticatedUserId);
    if (!item) return NextResponse.json({ success: true, item: null, removedKey: null, requiresRefresh: true });
    return NextResponse.json({ success: true, item, removedKey: null, approvalCount: approval[0].approval_count, requiredApprovalCount: approval[0].required_approval_count, hasCurrentAdminApproved: true });
  }

  if (parsed.data.action === "reject") {
    if (membership.system_role !== "admin") return NextResponse.json({ success: false, formError: "This time-off action is not allowed." }, { status: 403 });
    const { error: rejectionError } = await supabase.rpc("reject_time_off_request", {
      p_request_id: requestId,
      p_review_note: parsed.data.reviewNote ?? undefined,
    });
    if (rejectionError) {
      const postgresContext = "context" in rejectionError && typeof rejectionError.context === "string" ? rejectionError.context : null;
      const postgresWhere = "where" in rejectionError && typeof rejectionError.where === "string" ? rejectionError.where : null;
      console.error("time_off_requests rejection failed", {
        error: { code: rejectionError.code, message: rejectionError.message, details: rejectionError.details, hint: rejectionError.hint, context: postgresContext, where: postgresWhere },
        requestId,
        studioId: membership.studio_id,
        authenticatedUserId: membership.authenticatedUserId,
        reviewNotePresent: parsed.data.reviewNote !== null,
      });
      return NextResponse.json({ success: false, formError: "The request could not be rejected." }, { status: rejectionError.code === "P0001" ? 400 : 500 });
    }
    const item = await getNormalizedTimeOffRequest(requestId, membership.authenticatedUserId);
    return NextResponse.json({ success: true, item, removedKey: null });
  }

  const update = deriveTimeOffUpdate({
    action: parsed.data.action,
    actorId: membership.authenticatedUserId,
    actorRole: membership.system_role,
    ownerId: existing.user_id,
    currentStatus: existing.status,
    now: new Date().toISOString(),
  });
  if (!update) {
    return NextResponse.json({ success: false, formError: "This time-off action is not allowed." }, { status: 403 });
  }

  const { error, count } = await supabase
    .from("time_off_requests")
    .update(update, { count: "exact" })
    .eq("id", requestId)
    .eq("studio_id", membership.studio_id);
  if (error || count !== 1) {
    const postgresContext = error && "context" in error && typeof error.context === "string" ? error.context : null;
    const postgresWhere = error && "where" in error && typeof error.where === "string" ? error.where : null;
    console.error("time_off_requests transition failed", {
      error: error ? { code: error.code, message: error.message, details: error.details, hint: error.hint, context: postgresContext, where: postgresWhere } : null,
      transition: {
        authenticatedUserId: membership.authenticatedUserId,
        studioId: membership.studio_id,
        studioRole: membership.system_role,
        requestId,
        oldStatus: existing.status,
        requestedStatus: update.status,
        reviewNotePresent: parsed.data.reviewNote !== null,
        updateFields: timeOffUpdateFields(update),
        affectedRows: count,
      },
    });
    return NextResponse.json({ success: false, formError: "The request could not be updated." }, { status: 400 });
  }
  const item = await getNormalizedTimeOffRequest(requestId, membership.authenticatedUserId);
  if (update.status !== "cancelled" && !item) {
    console.error("time_off_requests transition succeeded but reload failed", {
      requestId,
      studioId: membership.studio_id,
      status: update.status,
    });
    return NextResponse.json({ success: true, item: null, removedKey: null, requiresRefresh: true });
  }
  return NextResponse.json({ success: true, item, removedKey: item ? null : `time_off_request_admin:${requestId}` });
}
