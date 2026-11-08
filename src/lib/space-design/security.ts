import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const SPACE_DESIGN_PATH = "/api/integrations/space-design/leads";
export const MAX_BODY_BYTES = 16 * 1024;

export function getSpaceDesignConfig() {
  return z.object({
    keyId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    studioId: z.uuid(),
    // Use these literal ASCII hex characters as the HMAC key, without decoding.
    secret: z.string().regex(/^[a-f0-9]{64}$/),
  }).parse({ keyId: process.env.SPACE_DESIGN_KEY_ID, studioId: process.env.SPACE_DESIGN_CRM_STUDIO_ID, secret: process.env.SPACE_DESIGN_HMAC_SECRET });
}

function equal(received: string, expected: string): boolean {
  const left = Buffer.from(received), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validSpaceDesignSignature(raw: Uint8Array, headers: Headers, config: ReturnType<typeof getSpaceDesignConfig>, now = Date.now()) {
  const timestamp = headers.get("x-sd-timestamp") ?? "";
  const signature = headers.get("x-sd-signature") ?? "";
  if (!equal(headers.get("x-sd-key-id") ?? "", config.keyId) || !/^\d{10}$/.test(timestamp)
    || Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300 || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", config.secret).update(`${timestamp}\nPOST\n${SPACE_DESIGN_PATH}\n`).update(raw).digest("hex");
  return equal(signature.slice(7), expected);
}
