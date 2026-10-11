import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { getWebPushConfig } from "@/lib/web-push/config";
import { pushSubscriptionSchema } from "@/lib/web-push/subscription";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

export async function GET(request: Request) {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return json({ error: "Authentication required." }, 401);
  const endpoint = request.headers.get("x-push-endpoint");
  if (endpoint && endpoint.length > 4096) return json({ error: "Invalid endpoint." }, 400);
  const client = await createClient();
  const subscription = endpoint ? await client.from("web_push_subscriptions").select("id").eq("endpoint", endpoint).eq("user_id", access.membership.authenticatedUserId).maybeSingle() : null;
  if (subscription?.error) return json({ error: "Subscription status unavailable." }, 503);
  return json({ userId: access.membership.authenticatedUserId, publicKey: getWebPushConfig()?.publicKey ?? null, enabled: !!subscription?.data });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid origin." }, 403);
  const input = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return json({ error: "Invalid subscription." }, 400);
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return json({ error: "Authentication required." }, 401);
  // Consistency guard for account changes while permission UI was open. Identity
  // and registration authority still come exclusively from verified auth/RLS.
  if (input.data.expectedUserId !== access.membership.authenticatedUserId) return json({ error: "Account changed." }, 409);
  const config = getWebPushConfig();
  if (!config) return json({ error: "Web Push is not configured." }, 503);
  const client = await createClient();
  const result = await client.rpc("register_web_push_subscription", {
    p_endpoint: input.data.endpoint, p_p256dh: input.data.keys.p256dh, p_auth: input.data.keys.auth,
    p_vapid_public_key: config.publicKey, p_locale: input.data.locale,
  });
  return result.error ? json({ error: "Subscription registration failed." }, 409) : json({ enabled: true, userId: access.membership.authenticatedUserId });
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid origin." }, 403);
  const input = z.object({ endpoint: z.string().max(4096) }).strict().safeParse(await request.json().catch(() => null));
  if (!input.success) return json({ error: "Invalid subscription." }, 400);
  // Allow cleanup even after membership is disabled; ownership remains RLS-bound.
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return json({ error: "Authentication required." }, 401);
  const result = await client.from("web_push_subscriptions").delete().eq("endpoint", input.data.endpoint).eq("user_id", data.user.id);
  return result.error ? json({ error: "Subscription removal failed." }, 503) : json({ enabled: false });
}
