import { NextResponse } from "next/server";
import { getNormalizedTimeOffRequest } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";
import { calendarFieldErrors, timeOffRequestSchema } from "@/lib/validation/calendar";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type CalendarSupabaseClient = SupabaseClient<Database>;

type VerifiedTimeOffMembership = {
  authenticatedUserId: string;
  studioId: string;
  systemRole: "admin" | "employee";
};

async function getVerifiedTimeOffMembership(
  supabase: CalendarSupabaseClient,
  authenticatedUserId: string,
): Promise<VerifiedTimeOffMembership | null> {
  const { data, error } = await supabase
    .from("studio_members")
    .select("user_id, studio_id, system_role, is_active")
    .eq("user_id", authenticatedUserId)
    .eq("is_active", true)
    .limit(2);

  if (error || !data || data.length !== 1) return null;

  const membership = data[0];
  if (
    membership.user_id !== authenticatedUserId
    || (membership.system_role !== "admin" && membership.system_role !== "employee")
  ) {
    return null;
  }

  return {
    authenticatedUserId,
    studioId: membership.studio_id,
    systemRole: membership.system_role,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const authenticatedUser = userData.user;
  if (userError || !authenticatedUser) return NextResponse.json({ success: false, formError: "Authentication is required." }, { status: 401 });

  const membership = await getVerifiedTimeOffMembership(supabase, authenticatedUser.id);
  if (!membership) return NextResponse.json({ success: false, formError: "Authentication is required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const parsed = timeOffRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, fieldErrors: calendarFieldErrors(parsed.error) }, { status: 400 });

  const payload = {
    studio_id: membership.studioId, user_id: membership.authenticatedUserId, request_type: parsed.data.requestType,
    start_date: parsed.data.startDate, end_date: parsed.data.endDate, all_day: parsed.data.allDay,
    start_time: parsed.data.allDay ? null : parsed.data.startTime,
    end_time: parsed.data.allDay ? null : parsed.data.endTime, private_note: parsed.data.privateNote,
  };
  const { data, error } = await supabase.from("time_off_requests").insert(payload).select("id").single();
  if (error) {
    console.error("time_off_requests insert error", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      authenticatedUserMatchesInsertUser: authenticatedUser.id === payload.user_id,
      membershipStudioMatchesInsertStudio: membership.studioId === payload.studio_id,
      membershipSystemRole: membership.systemRole,
    });
  }
  if (error || !data) return NextResponse.json({ success: false, formError: "The time-off request could not be created. Check the date range and try again." }, { status: 400 });
  const item = await getNormalizedTimeOffRequest(data.id, membership.authenticatedUserId);
  return item ? NextResponse.json({ success: true, item }, { status: 201 }) : NextResponse.json({ success: false, formError: "The request was created but could not be reloaded." }, { status: 500 });
}
