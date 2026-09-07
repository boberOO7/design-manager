import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { calendarSettingsSchema } from "@/lib/validation/calendar";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });

  const membership = await getActiveStudioMembership();
  if (!membership || membership.authenticatedUserId !== user.id) return NextResponse.json({ success: false, error: "An active studio membership is required." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 }); }
  const parsed = calendarSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Choose a supported time format." }, { status: 400 });

  const { data, error } = await supabase.auth.updateUser({ data: { calendar_time_format: parsed.data.timeFormat } });

  if (error || !data.user) return NextResponse.json({ success: false, error: "The calendar settings could not be saved." }, { status: 400 });
  return NextResponse.json({ success: true, timeFormat: parsed.data.timeFormat });
}
