import "server-only";
import { z } from "zod";

export function getWebPushConfig() {
  const result = z.object({
    WEB_PUSH_VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    WEB_PUSH_VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    WEB_PUSH_VAPID_SUBJECT: z.string().refine(value => value.startsWith("mailto:") || value.startsWith("https://")),
    CRON_SECRET: z.string().min(1),
  }).safeParse(process.env);
  return result.success ? {
    publicKey: result.data.WEB_PUSH_VAPID_PUBLIC_KEY,
    privateKey: result.data.WEB_PUSH_VAPID_PRIVATE_KEY,
    subject: result.data.WEB_PUSH_VAPID_SUBJECT,
  } : null;
}
