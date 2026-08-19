import { NextResponse } from "next/server";
import { z } from "zod";
import { getNormalizedCalendarEvent } from "@/data/queries/calendar-item";
import { createClient } from "@/lib/supabase/server";

const responseSchema = z.object({ status: z.enum(["accepted", "declined"]) }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });
  const { inviteId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 }); }
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Choose a valid response." }, { status: 400 });
  const { data: invite, error } = await supabase.from("calendar_event_invites")
    .update({ status: parsed.data.status, responded_at: new Date().toISOString() })
    .eq("id", inviteId).eq("user_id", userData.user.id).neq("status", parsed.data.status).select("event_id").maybeSingle();
  if (error || !invite) return NextResponse.json({ success: false, error: "This invitation is no longer available." }, { status: 400 });
  const item = await getNormalizedCalendarEvent(invite.event_id, userData.user.id);
  return NextResponse.json({ success: true, item });
}
