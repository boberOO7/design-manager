import { z } from "zod";
import { feedbackAnswersSchema } from "@/lib/feedback-template";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeedbackSourceHash } from "@/lib/feedback-rate-limit";
import { feedbackResponseSchema, feedbackTokenSchema } from "@/lib/feedback";

const json = (body: object, status: number, extraHeaders: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...extraHeaders } });

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // Browsers must submit from this site; the token is the only public authority.
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "forbidden" }, 403);
  const { token } = await params;
  if (!feedbackTokenSchema.safeParse(token).success) return json({ error: "unavailable" }, 410);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "invalid" }, 400);
  // Bound the actual stream, not the untrusted Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "invalid" }, 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 200_000) { await reader.cancel(); return json({ error: "invalid" }, 413); }
      chunks.push(value);
    }
  } catch { return json({ error: "invalid" }, 400); }
  const body = Buffer.concat(chunks).toString("utf8");
  let input: unknown;
  try { input = JSON.parse(body); } catch { return json({ error: "invalid" }, 400); }
  const versioned = z.strictObject({ answers: feedbackAnswersSchema, website: z.literal("") }).safeParse(input);
  const legacy = feedbackResponseSchema.safeParse(input);
  if (!versioned.success && !legacy.success) return json({ error: "invalid" }, 400);
  const answers = versioned.success ? versioned.data.answers : legacy.success ? {
    satisfaction: legacy.data.satisfaction, communication: legacy.data.communication,
    timeliness: legacy.data.timeliness, expectations: legacy.data.expectations,
    recommendation: legacy.data.recommendation, strengths: legacy.data.strengths, improvements: legacy.data.improvements,
  } : null;
  if (!answers) return json({ error: "invalid" }, 400);
  const client = createAdminClient();
  const { data, error } = await client.rpc("submit_feedback_with_cooldown", {
    p_token: token, p_answers: answers, p_source_hash: getFeedbackSourceHash(request, token),
  });
  if (error?.message === "feedback_rate_limited") {
    const remaining = Number(error.details);
    const retryAfter = Number.isInteger(remaining) && remaining > 0 && remaining <= 300 ? remaining : 300;
    return json({ error: "rate_limited" }, 429, { "Retry-After": String(retryAfter) });
  }
  if (error) return json({ error: error.code === "22023" ? "invalid" : "save" }, error.code === "22023" ? 400 : 500);
  if (!data) return json({ error: "unavailable" }, 410);
  return json({ ok: true }, 200);
}
