import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processAutomaticLabor } from "@/lib/finance-automatic-labor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = Buffer.from(process.env.CRON_SECRET ?? "");
  const received = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processAutomaticLabor();
    return NextResponse.json(result, { status: result.failed ? 500 : 200 });
  }
  catch { return NextResponse.json({ error: "Automatic labor maintenance failed." }, { status: 500 }); }
}
