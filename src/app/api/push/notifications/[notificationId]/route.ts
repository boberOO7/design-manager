import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { safeNotificationHref } from "@/lib/web-push/subscription";
import { getWebPushPreview } from "@/lib/web-push/preview";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return NextResponse.json({}, { status: 401, headers });
  const { notificationId } = await params;
  const subscriptionId = new URL(request.url).searchParams.get("subscriptionId");
  if (!z.uuid().safeParse(notificationId).success || !z.uuid().safeParse(subscriptionId).success) return NextResponse.json({}, { status: 400, headers });
  const client = await createClient();
  const [notification, subscription] = await Promise.all([
    client.from("notifications").select("href, read_at, notification_type, metadata, entity_id, entity_type").eq("id", notificationId).eq("recipient_id", access.membership.authenticatedUserId).maybeSingle(),
    client.from("web_push_subscriptions").select("id, locale").eq("id", subscriptionId ?? "").eq("user_id", access.membership.authenticatedUserId).maybeSingle(),
  ]);
  if (notification.error || subscription.error) return NextResponse.json({}, { status: 503, headers });
  if (!notification.data || !subscription.data) return NextResponse.json({}, { status: 404, headers });
  let calendarContextAllowed = false;
  if (notification.data.entity_type === "calendar_event" && notification.data.entity_id) {
    // Calendar notifications also cover HR/personal events. Only reveal names
    // for an accessible work event linked to a project; otherwise stay generic.
    const event = await client.from("calendar_events").select("event_type, project_id").eq("id", notification.data.entity_id).maybeSingle();
    calendarContextAllowed = !event.error && !!event.data?.project_id && ["meeting", "presentation", "site_visit", "internal_review"].includes(event.data.event_type);
  }
  const preview = getWebPushPreview(notification.data, subscription.data.locale, calendarContextAllowed);
  return NextResponse.json({ recipientId: access.membership.authenticatedUserId, href: safeNotificationHref(notification.data.href), read: notification.data.read_at !== null, ...preview }, { headers });
}
