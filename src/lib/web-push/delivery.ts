import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebPushConfig } from "./config";
import { sendWebPush } from "./send";

export async function deliverWebPush() {
  const config = getWebPushConfig();
  if (!config) throw new Error("Web Push configuration is missing.");
  const admin = createAdminClient();
  const claimed = await admin.rpc("claim_web_push_deliveries", { p_limit: 100 });
  if (claimed.error) throw new Error("Unable to claim Web Push deliveries.");
  const settled = await Promise.allSettled((claimed.data ?? []).map(async job => {
    const { status, reason } = await sendWebPush(job, {
      notificationId: job.notification_id, subscriptionId: job.subscription_id, recipientId: job.user_id,
      // The worker resolves the privacy-filtered preview from this ID only
      // after checking the signed-in recipient and active subscription.
      title: "StudioFlow", body: job.locale === "en" ? "You have a new notification in StudioFlow." : "У вас нове сповіщення у StudioFlow.",
    }, config);
    const finished = await admin.rpc("finish_web_push_delivery", { p_id: job.id, p_lease_token: job.lease_token, p_status: status });
    if (finished.error) throw new Error("Unable to acknowledge Web Push delivery.");
    return { outcome: status >= 200 && status < 300 ? "sent" : status === 404 || status === 410 ? "expired" : "retry", reason };
  }));
  // Finish every claimed job before acknowledging the webhook, even if one
  // acknowledgement fails. Remaining leases are recovered by the database timer.
  const results = settled.map(result => {
    if (result.status === "rejected") throw new Error("Unable to acknowledge Web Push delivery.");
    return result.value;
  });
  const failureReasons: Record<string, number> = {};
  for (const result of results) if (result.reason !== "accepted") failureReasons[result.reason] = (failureReasons[result.reason] ?? 0) + 1;
  return { claimed: results.length, sent: results.filter(x => x.outcome === "sent").length, expired: results.filter(x => x.outcome === "expired").length, retry: results.filter(x => x.outcome === "retry").length, failureReasons };
}
