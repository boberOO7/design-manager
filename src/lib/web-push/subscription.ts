import { z } from "zod";

// A subscription is untrusted input, including when read by the privileged sender.
export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash && (
      url.hostname === "fcm.googleapis.com" || url.hostname === "web.push.apple.com" ||
      /^[a-z0-9-]+\.push\.services\.mozilla\.com$/.test(url.hostname) ||
      /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
    );
  } catch { return false; }
}

export const pushSubscriptionSchema = z.object({
  expectedUserId: z.uuid(),
  endpoint: z.string().max(4096).refine(isAllowedPushEndpoint),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}={0,2}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/) }).strict(),
  locale: z.enum(["uk", "en"]),
}).strict();

export function safeNotificationHref(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(href)) return "/dashboard";
  const url = new URL(href, "https://studioflow.invalid");
  return url.origin === "https://studioflow.invalid" ? `${url.pathname}${url.search}${url.hash}` : "/dashboard";
}
