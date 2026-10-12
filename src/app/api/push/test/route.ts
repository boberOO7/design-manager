import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebPushConfig } from "@/lib/web-push/config";
import { sendWebPush } from "@/lib/web-push/send";
import { isAllowedPushEndpoint } from "@/lib/web-push/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200, extraHeaders = {}) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", ...extraHeaders } });
const testBody = (locale: string) => locale === "en" ? "This is a test notification from StudioFlow." : "Це тестове сповіщення StudioFlow.";

// The worker verifies the current recipient/subscription before displaying a test.
export async function GET(request: Request) {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return json({}, 401);
  const id = new URL(request.url).searchParams.get("subscriptionId");
  if (!z.uuid().safeParse(id).success) return json({}, 400);
  const client = await createClient();
  const { data, error } = await client.from("web_push_subscriptions").select("id,locale").eq("id", id ?? "").eq("user_id", access.membership.authenticatedUserId).maybeSingle();
  if (error) return json({}, 503);
  if (!data) return json({}, 404);
  return json({ recipientId: access.membership.authenticatedUserId, href: "/dashboard", read: false, title: "StudioFlow", body: testBody(data.locale), test: true });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ reason: "invalid_origin" }, 403);
  const endpoint = request.headers.get("x-push-endpoint");
  if (!endpoint || endpoint.length > 4096 || !isAllowedPushEndpoint(endpoint)) return json({ reason: "invalid_subscription" }, 400);
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return json({ reason: "authentication_required" }, 401);
  const config = getWebPushConfig();
  if (!config) return json({ reason: "configuration_invalid" }, 503);
  const client = await createClient();
  const claim = await client.rpc("claim_web_push_test", { p_endpoint: endpoint });
  if (claim.error) {
    if (claim.error.message === "web_push_test_rate_limited") return json({ reason: "rate_limited" }, 429, { "Retry-After": "60" });
    if (claim.error.message === "web_push_subscription_missing") return json({ reason: "subscription_missing" }, 409);
    return json({ reason: "unavailable" }, 503);
  }
  if (!claim.data) return json({ reason: "subscription_missing" }, 409);
  try {
    const admin = createAdminClient();
    const { data: subscription, error } = await admin.from("web_push_subscriptions").select("*").eq("id", claim.data).eq("user_id", access.membership.authenticatedUserId).maybeSingle();
    if (error) return json({ reason: "unavailable" }, 503);
    if (!subscription) return json({ reason: "subscription_missing" }, 409);
    const result = await sendWebPush(subscription, {
      notificationId: randomUUID(), subscriptionId: subscription.id, recipientId: subscription.user_id,
      title: "StudioFlow", body: testBody(subscription.locale), test: true,
    }, config);
    const accepted = result.status >= 200 && result.status < 300;
    const expired = result.status === 404 || result.status === 410;
    if (expired) {
      const removal = await admin.from("web_push_subscriptions").delete().eq("id", subscription.id).eq("user_id", access.membership.authenticatedUserId);
      if (removal.error) return json({ reason: "unavailable" }, 503);
    }
    return json({ accepted, reason: result.reason, status: result.status }, accepted ? 200 : expired ? 410 : 502);
  } catch {
    return json({ reason: "unavailable" }, 503);
  }
}
