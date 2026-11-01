import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export function equalSecret(received: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const left = Buffer.from(received), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validMetaSignature(body: Uint8Array, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return equalSecret(signature.slice(7), createHmac("sha256", secret).update(body).digest("hex"));
}

export function authorizedMetaWorker(request: Request): boolean {
  const value = request.headers.get("authorization");
  return Boolean(value?.startsWith("Bearer ") && equalSecret(value.slice(7), process.env.CRON_SECRET));
}
