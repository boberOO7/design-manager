import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncIcecatDaily } from "@/lib/equipment-catalog/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!secret || !token || Buffer.byteLength(token) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (process.env.ICECAT_SYNC_ENABLED !== "true") return NextResponse.json({ status: "disabled" });
  try { return NextResponse.json(await syncIcecatDaily(createAdminClient())); }
  catch {
    console.error("Equipment catalog sync failed; inspect equipment_catalog_sync_state.last_error.");
    return NextResponse.json({ error: "Catalog sync failed." }, { status: 500 });
  }
}
