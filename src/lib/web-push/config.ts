import "server-only";
import { z } from "zod";
import { createECDH } from "node:crypto";

export function getWebPushConfig() {
  const result = z.object({
    WEB_PUSH_VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    WEB_PUSH_VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    WEB_PUSH_VAPID_SUBJECT: z.string().refine(value => value.startsWith("mailto:") || value.startsWith("https://")),
    CRON_SECRET: z.string().min(1),
  }).safeParse(process.env);
  if (!result.success) return null;
  try {
    const key = createECDH("prime256v1");
    key.setPrivateKey(Buffer.from(result.data.WEB_PUSH_VAPID_PRIVATE_KEY, "base64url"));
    if (key.getPublicKey("base64url", "uncompressed") !== result.data.WEB_PUSH_VAPID_PUBLIC_KEY) {
      console.warn("Web Push configuration invalid.", { reason: "vapid_key_pair_mismatch" });
      return null;
    }
  } catch {
    console.warn("Web Push configuration invalid.", { reason: "invalid_vapid_key_pair" });
    return null;
  }
  return {
    publicKey: result.data.WEB_PUSH_VAPID_PUBLIC_KEY,
    privateKey: result.data.WEB_PUSH_VAPID_PRIVATE_KEY,
    subject: result.data.WEB_PUSH_VAPID_SUBJECT,
  };
}
