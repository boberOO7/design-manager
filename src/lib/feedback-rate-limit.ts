import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export function getFeedbackSourceHash(request: Request, token: string) {
  // Only Vercel's overwritten header is trusted; elsewhere use a shared link bucket.
  const forwarded = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  const version = forwarded ? isIP(forwarded) : 0;
  const source = forwarded && version ? version === 6 ? new URL(`http://[${forwarded}]/`).hostname : forwarded : "unknown";
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Feedback rate limit configuration is missing SUPABASE_SECRET_KEY.");
  return createHmac("sha256", secret).update(JSON.stringify([token, source])).digest("hex");
}
