import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function hasValidCronAuthorization(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const received = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("generate_equipment_maintenance_notifications");
  if (error) {
    console.error("Equipment maintenance notification worker failed", error);
    return NextResponse.json({ error: "Equipment maintenance notification worker failed." }, { status: 500 });
  }
  return NextResponse.json({ success: true, notificationsCreated: data });
}
