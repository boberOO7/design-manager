import { NextResponse } from "next/server";
import { getGoogleCalendarActor, isSameOriginMutation } from "@/lib/google-calendar/auth";
import { decryptRefreshToken } from "@/lib/google-calendar/crypto";
import { createGoogleOAuthClient } from "@/lib/google-calendar/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const actor = await getGoogleCalendarActor();
  if (!actor) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const admin = createAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("google_calendar_connections")
    .select("id")
    .eq("user_id", actor.user.id)
    .eq("studio_id", actor.membership.studio_id)
    .maybeSingle();
  if (connectionError) return NextResponse.json({ error: "Unable to disconnect Google Calendar." }, { status: 500 });
  if (!connection) return NextResponse.json({ success: true });

  const { data: credential } = await admin.from("google_calendar_server_credentials")
    .select("encrypted_refresh_token").eq("connection_id", connection.id).maybeSingle();
  if (credential) {
    try {
      await createGoogleOAuthClient().revokeToken(decryptRefreshToken(credential.encrypted_refresh_token));
    } catch {
      // Local credentials are still removed. A revoked/expired token can make
      // Google's revocation endpoint fail and must not trap the user connected.
    }
  }

  const { error: deleteError } = await admin.from("google_calendar_connections")
    .delete().eq("id", connection.id).eq("user_id", actor.user.id);
  if (deleteError) return NextResponse.json({ error: "Unable to remove stored Google authorization." }, { status: 500 });
  return NextResponse.json({ success: true });
}
