import { createHash } from "node:crypto";
import { spaceDesignPayload } from "@/lib/space-design/contracts";
import { acceptSpaceDesignLead } from "@/lib/space-design/queue";
import { getSpaceDesignConfig, MAX_BODY_BYTES, validSpaceDesignSignature } from "@/lib/space-design/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: object, status: number, retry = false) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...(retry ? { "Retry-After": "60" } : {}) } });
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "unsupported_media_type" }, 415);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  try {
    // Stream with a hard cap; Content-Length is optional and untrusted.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "invalid_payload" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return json({ error: "payload_too_large" }, 413);
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const raw = Buffer.concat(chunks);
    const config = getSpaceDesignConfig();
    if (!validSpaceDesignSignature(raw, request.headers, config)) return json({ error: "unauthorized" }, 401);
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); }
    catch { return json({ error: "invalid_payload" }, 400); }
    const parsed = spaceDesignPayload.safeParse(body);
    if (!parsed.success || request.headers.get("idempotency-key")?.toLowerCase() !== parsed.data.submission_id) return json({ error: "invalid_payload" }, 400);
    // Zod emits fields in schema order: JSON whitespace/key order must not turn
    // a legitimate retry into a conflict. HMAC still authenticates raw bytes.
    const payloadHash = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
    const result = await acceptSpaceDesignLead(config.keyId, config.studioId, payloadHash, parsed.data);
    if (result === "unauthorized") return json({ error: "unauthorized" }, 401);
    if (result === "rate_limited") return json({ error: "rate_limited" }, 429, true);
    if (result === "conflict") return json({ error: "idempotency_conflict" }, 409);
    if (result !== "accepted" && result !== "replayed") throw new Error("space_design_unexpected_result");
    return json({ submission_id: parsed.data.submission_id, status: result === "accepted" ? "accepted" : "already_accepted" }, result === "accepted" ? 202 : 200);
  } catch {
    return json({ error: "temporarily_unavailable" }, 503, true);
  }
}
