import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ dayOffId: string }> };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isDateOnly(value: string): boolean { const date = new Date(`${value}T12:00:00Z`); return datePattern.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function parseDayOff(value: unknown): { date: string; name: string; note: string | null } | null { if (!isRecord(value)) return null; const date = typeof value.date === "string" ? value.date : ""; const name = typeof value.name === "string" ? value.name.trim() : ""; const rawNote = typeof value.note === "string" ? value.note.trim() : ""; return isDateOnly(date) && name.length > 0 && name.length <= 160 && rawNote.length <= 2000 ? { date, name, note: rawNote || null } : null; }
async function requireAdmin() { const membership = await getActiveStudioMembership(); return membership?.system_role === "admin" ? membership : null; }

export async function PATCH(request: Request, context: Context) {
  const membership = await requireAdmin();
  if (!membership) return NextResponse.json({ success: false, formError: "Administrator access is required." }, { status: 403 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const value = parseDayOff(body); if (!value) return NextResponse.json({ success: false, formError: "Enter a valid name and date." }, { status: 400 });
  const { dayOffId } = await context.params; const supabase = await createClient();
  const { data, error } = await supabase.from("studio_days_off").update(value).eq("id", dayOffId).eq("studio_id", membership.studio_id).select("id, date, name, note").maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, formError: error?.code === "23505" ? "A day off is already configured for this date." : "The day off could not be saved." }, { status: 400 });
  return NextResponse.json({ success: true, dayOff: data });
}

export async function DELETE(_request: Request, context: Context) {
  const membership = await requireAdmin();
  if (!membership) return NextResponse.json({ success: false, formError: "Administrator access is required." }, { status: 403 });
  const { dayOffId } = await context.params; const supabase = await createClient();
  const { data, error } = await supabase.from("studio_days_off").delete().eq("id", dayOffId).eq("studio_id", membership.studio_id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, formError: "The day off could not be deleted." }, { status: 400 });
  return NextResponse.json({ success: true, id: data.id });
}
