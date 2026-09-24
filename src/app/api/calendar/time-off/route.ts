import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getNormalizedTimeOffRequest } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";
import { calendarFieldErrors, timeOffRequestSchema } from "@/lib/validation/calendar";
import { canCreateTimeOffRequestType } from "@/lib/calendar-creation";

export async function GET(request: Request) {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  const supabase = await createClient();
  if (startDate !== null || endDate !== null) {
    const start = z.iso.date().safeParse(startDate);
    const end = z.iso.date().safeParse(endDate);
    if (!start.success || !end.success || end.data < start.data) return NextResponse.json({ success: false }, { status: 400 });
    const { data, error } = await supabase.rpc("project_vacation_request", {
      p_studio_id: membership.studio_id, p_user_id: membership.authenticatedUserId, p_start: start.data, p_end: end.data,
    }).single();
    if (error) return NextResponse.json({ success: false }, { status: 403 });
    if (!data || data.available === null) return NextResponse.json({ success: false, code: "vacation_balance_unconfigured" }, { status: 422 });
    return NextResponse.json({ success: true, ...data });
  }
  const asOf = z.iso.date().safeParse(params.get("asOf"));
  if (!asOf.success) return NextResponse.json({ success: false }, { status: 400 });
  const { data, error } = await supabase.rpc("get_vacation_balance", {
    p_studio_id: membership.studio_id, p_user_id: membership.authenticatedUserId, p_as_of: asOf.data,
  });
  if (error) return NextResponse.json({ success: false }, { status: 403 });
  if (data === null) return NextResponse.json({ success: false, code: "vacation_balance_unconfigured" }, { status: 422 });
  return NextResponse.json({ success: true, available: data });
}

export async function POST(request: Request) {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, formError: "Authentication is required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = timeOffRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });
  if (!canCreateTimeOffRequestType(membership.system_role, parsed.data.requestType)) {
    return NextResponse.json({ success: false, fieldErrors: { requestType: "This absence type is not available for your role." } }, { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("time_off_requests").insert({
    studio_id: membership.studio_id, user_id: membership.authenticatedUserId, request_type: parsed.data.requestType,
    start_date: parsed.data.startDate, end_date: parsed.data.endDate, all_day: parsed.data.allDay,
    start_time: parsed.data.allDay ? null : parsed.data.startTime,
    end_time: parsed.data.allDay ? null : parsed.data.endTime, private_note: parsed.data.privateNote,
  }).select("id").single();
  if (error?.message.includes("vacation_balance_exceeded")) {
    return NextResponse.json({ success: false, fieldErrors: { endDate: "vacation_balance_exceeded" } }, { status: 400 });
  }
  if (error || !data) {
    console.error("time_off_requests insert error", error);
    return NextResponse.json({ success: false, formError: "The time-off request could not be created. Check the date range and try again." }, { status: 400 });
  }
  const item = await getNormalizedTimeOffRequest(data.id, membership.authenticatedUserId);
  return item ? NextResponse.json({ success: true, item }, { status: 201 }) : NextResponse.json({ success: false, formError: "The request was created but could not be reloaded." }, { status: 500 });
}
