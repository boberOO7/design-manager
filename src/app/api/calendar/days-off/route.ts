import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isDateOnly(value: string): boolean { const date = new Date(`${value}T12:00:00Z`); return datePattern.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }

function parseDayOff(value: unknown): { date: string; name: string; note: string | null } | null {
  if (!isRecord(value)) return null;
  const candidate = value;
  const date = typeof candidate.date === "string" ? candidate.date : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const rawNote = typeof candidate.note === "string" ? candidate.note.trim() : "";
  if (!isDateOnly(date) || !name || name.length > 160 || rawNote.length > 2000) return null;
  return { date, name, note: rawNote || null };
}

export async function POST(request: Request) {
  const membership = await getActiveStudioMembership();
  if (!membership || membership.system_role !== "admin") return NextResponse.json({ success: false, formError: "Administrator access is required." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Invalid request body." }, { status: 400 }); }
  const value = parseDayOff(body);
  if (!value) return NextResponse.json({ success: false, formError: "Enter a valid name and date." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("studio_days_off").insert({ ...value, studio_id: membership.studio_id, created_by: membership.authenticatedUserId }).select("id, date, name, note").single();
  if (error || !data) return NextResponse.json({ success: false, formError: error?.code === "23505" ? "A day off is already configured for this date." : "The day off could not be saved." }, { status: 400 });
  return NextResponse.json({ success: true, dayOff: data }, { status: 201 });
}
