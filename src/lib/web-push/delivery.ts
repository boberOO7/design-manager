import "server-only";
import webPush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebPushConfig } from "./config";
import { isAllowedPushEndpoint } from "./subscription";

export async function deliverWebPush() {
  const config = getWebPushConfig();
  if (!config) throw new Error("Web Push configuration is missing.");
  const admin = createAdminClient();
  const claimed = await admin.rpc("claim_web_push_deliveries", { p_limit: 100 });
  if (claimed.error) throw new Error("Unable to claim Web Push deliveries.");
  const settled = await Promise.allSettled((claimed.data ?? []).map(async job => {
    let status = 0;
    if (!isAllowedPushEndpoint(job.endpoint) || job.vapid_public_key !== config.publicKey) {
      status = 410;
    } else {
      try {
        const result = await webPush.sendNotification({ endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth } }, JSON.stringify({
          notificationId: job.notification_id, subscriptionId: job.subscription_id, recipientId: job.user_id,
          // The worker resolves the privacy-filtered preview from this ID only
          // after checking the signed-in recipient and active subscription.
          title: "StudioFlow", body: job.locale === "en" ? "You have a new notification in StudioFlow." : "У вас нове сповіщення у StudioFlow.",
        }), { vapidDetails: config, TTL: 3600, urgency: "normal", timeout: 10_000 });
        status = result.statusCode;
      } catch (error) {
        // Provider error bodies/endpoints can contain capabilities; never log them.
        if (error instanceof webPush.WebPushError) status = error.statusCode;
      }
    }
    const finished = await admin.rpc("finish_web_push_delivery", { p_id: job.id, p_lease_token: job.lease_token, p_status: status });
    if (finished.error) throw new Error("Unable to acknowledge Web Push delivery.");
    return status >= 200 && status < 300 ? "sent" : status === 404 || status === 410 ? "expired" : "retry";
  }));
  // Finish every claimed job before acknowledging the webhook, even if one
  // acknowledgement fails. Remaining leases are recovered by the database timer.
  const results = settled.map(result => {
    if (result.status === "rejected") throw new Error("Unable to acknowledge Web Push delivery.");
    return result.value;
  });
  return { claimed: results.length, sent: results.filter(x => x === "sent").length, expired: results.filter(x => x === "expired").length, retry: results.filter(x => x === "retry").length };
}
