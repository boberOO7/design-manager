import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverWebPush } from "@/lib/web-push/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const authorization = request.headers.get("authorization");
  const expected = Buffer.from(process.env.CRON_SECRET ?? "");
  const received = Buffer.from(authorization?.slice("Bearer ".length) ?? "");
  return authorization?.startsWith("Bearer ") && expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json(await deliverWebPush(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Web Push delivery failed." }, { status: 503 });
  }
}

// pg_net invokes the existing leased worker after the queue insertion commits.
// A correlated acknowledgement arms retries/drains further batches in Postgres.
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = z.object({ dispatchId: z.uuid() }).strict().safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid dispatch." }, { status: 400 });
  const admin = createAdminClient();
  try {
    const result = await deliverWebPush();
    const acknowledgement = await admin.rpc("complete_web_push_dispatch", { p_dispatch_id: body.data.dispatchId, p_success: true });
    if (acknowledgement.error) throw new Error("Unable to acknowledge dispatch.");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // The database watchdog also recovers requests when this callback is lost.
    try { await admin.rpc("complete_web_push_dispatch", { p_dispatch_id: body.data.dispatchId, p_success: false }); } catch { /* watchdog retries */ }
    return NextResponse.json({ error: "Web Push delivery failed." }, { status: 503 });
  }
}
