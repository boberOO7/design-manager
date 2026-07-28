import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(_request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const membership = await getActiveStudioMembership();
  if (!membership) return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });
  const { notificationId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("id", notificationId).eq("recipient_id", membership.authenticatedUserId).is("read_at", null).select("id, read_at").maybeSingle();
  if (error) return NextResponse.json({ success: false, error: "The notification could not be updated." }, { status: 400 });
  return NextResponse.json({ success: true, notification: data });
}
