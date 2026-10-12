import "server-only";
import webPush from "web-push";
import type { Database } from "@/types/database.types";
import type { getWebPushConfig } from "./config";
import { isAllowedPushEndpoint } from "./subscription";

export async function sendWebPush(
  subscription: Pick<Database["public"]["Tables"]["web_push_subscriptions"]["Row"], "endpoint" | "p256dh" | "auth" | "vapid_public_key">,
  payload: { notificationId: string; subscriptionId: string; recipientId: string; title: string; body: string; test?: boolean },
  config: NonNullable<ReturnType<typeof getWebPushConfig>>,
) {
  let status = 0;
  let reason = "transport_error";
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    status = 410; reason = "invalid_endpoint";
  } else if (subscription.vapid_public_key !== config.publicKey) {
    status = 410; reason = "vapid_public_key_mismatch";
  } else {
    try {
      const result = await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), {
        vapidDetails: config, TTL: 3600, urgency: "normal", timeout: 10_000,
      });
      status = result.statusCode;
      reason = status >= 200 && status < 300 ? "accepted" : "provider_rejected";
    } catch (error) {
      if (error instanceof webPush.WebPushError) {
        status = error.statusCode;
        reason = status === 404 ? "provider_404" : status === 410 ? "provider_410" : "provider_rejected";
      } else if (error instanceof Error && "code" in error && error.code === "ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY") {
        status = 410; reason = "invalid_subscription_key";
      }
    }
  }
  // Never log provider bodies, endpoint capabilities, keys or recipient data.
  if (reason !== "accepted") console.warn("Web Push delivery rejected.", { reason, status });
  return { status, reason };
}
