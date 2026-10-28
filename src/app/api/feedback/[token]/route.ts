import { z } from "zod";
import { feedbackAnswersSchema } from "@/lib/feedback-template";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { feedbackResponseSchema, feedbackTokenSchema } from "@/lib/feedback";

const json = (body: object, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

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
  const client = createAdminClient();
  const result = versioned.success
    ? await client.rpc("submit_versioned_feedback", { p_token: token, p_answers: versioned.data.answers })
    : legacy.success ? await client.rpc("submit_project_feedback", {
      p_token: token, p_satisfaction: legacy.data.satisfaction, p_communication: legacy.data.communication,
      p_timeliness: legacy.data.timeliness, p_expectations: legacy.data.expectations, p_recommendation: legacy.data.recommendation,
      p_strengths: legacy.data.strengths, p_improvements: legacy.data.improvements,
    }) : { data: false, error: null };
  const { data, error } = result;
  if (error) return json({ error: error.code === "22023" ? "invalid" : "save" }, error.code === "22023" ? 400 : 500);
  if (!data) return json({ error: "unavailable" }, 410);
  return json({ ok: true }, 200);
}
