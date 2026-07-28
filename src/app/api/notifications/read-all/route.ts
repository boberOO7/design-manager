import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("recipient_id", membership.authenticatedUserId).is("read_at", null);
  if (error) return NextResponse.json({ success: false, error: "Notifications could not be updated." }, { status: 400 });
  return NextResponse.json({ success: true });
}
