import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDailyWorkLog } from "@/data/queries/work-log";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { instantToDateOnly } from "@/lib/calendar";
import { workLogInputSchema } from "@/lib/work-log";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? instantToDateOnly(new Date().toISOString());
  if (!z.iso.date().safeParse(date).success) return NextResponse.json({ success: false }, { status: 400 });
  const log = await getDailyWorkLog(date);
  return log ? NextResponse.json(log) : NextResponse.json({ success: false }, { status: 403 });
}

export async function PUT(request: Request) {
  const input = workLogInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ success: false }, { status: 400 });
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return NextResponse.json({ success: false }, { status: 403 });
  const client = await createClient();
  const { error } = await client.rpc("save_daily_work_log", { p_work_date: input.data.date, p_entries: input.data.entries });
  if (error) return NextResponse.json({ success: false }, { status: 400 });
  revalidatePath(`/team/${access.membership.authenticatedUserId}`);
  revalidatePath("/statistics");
  return NextResponse.json({ success: true });
}
