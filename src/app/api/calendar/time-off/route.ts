import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getNormalizedTimeOffRequest } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";
import { calendarFieldErrors, timeOffRequestSchema } from "@/lib/validation/calendar";

export async function POST(request: Request) {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, formError: "Authentication is required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = timeOffRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("time_off_requests").insert({
    studio_id: membership.studio_id, user_id: membership.authenticatedUserId, request_type: parsed.data.requestType,
    start_date: parsed.data.startDate, end_date: parsed.data.endDate, all_day: parsed.data.allDay,
    start_time: parsed.data.allDay ? null : parsed.data.startTime,
    end_time: parsed.data.allDay ? null : parsed.data.endTime, private_note: parsed.data.privateNote,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ success: false, formError: "The time-off request could not be created. Check the date range and try again." }, { status: 400 });
  const item = await getNormalizedTimeOffRequest(data.id, membership.authenticatedUserId);
  return item ? NextResponse.json({ success: true, item }, { status: 201 }) : NextResponse.json({ success: false, formError: "The request was created but could not be reloaded." }, { status: 500 });
}
