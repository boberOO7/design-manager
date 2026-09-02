import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { logGoogleCalendarFailure } from "@/lib/google-calendar/diagnostics";
import { processGoogleCalendarReconciliationQueue } from "@/lib/google-calendar/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function hasValidCronAuthorization(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || !authorization?.startsWith("Bearer ")) return false;
  const received = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(cronSecret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await processGoogleCalendarReconciliationQueue(20);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logGoogleCalendarFailure(error);
    return NextResponse.json({ error: "Google Calendar reconciliation worker failed." }, { status: 500 });
  }
}
