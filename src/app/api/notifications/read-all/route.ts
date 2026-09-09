import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("notifications").update({ read_at: now })
    .eq("recipient_id", membership.authenticatedUserId).lte("created_at", now).is("read_at", null);
  if (error) return NextResponse.json({ success: false, error: "Notifications could not be updated." }, { status: 400 });
  return NextResponse.json({ success: true });
}
