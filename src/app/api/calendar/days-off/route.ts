import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { scheduleAutomaticLabor } from "@/lib/finance-automatic-labor";
import { STUDIO_DAY_OFF_COLUMNS } from "@/lib/studio-days-off";
import { studioDaysOffCreateSchema, studioDaysOffDeleteSchema } from "@/lib/validation/studio-days-off";

export async function POST(request: Request) {
  const membership = await getActiveStudioMembership();
  if (!membership || membership.system_role !== "admin") return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, code: "invalid" }, { status: 400 }); }
  const parsed = studioDaysOffCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, code: "invalid" }, { status: 400 });
  const value = parsed.data;
  const common = { name: value.name, note: value.note, studio_id: membership.studio_id, created_by: membership.authenticatedUserId };
  const rows = "dates" in value ? value.dates.map((date) => ({ ...common, date, end_date: date }))
    : "startDate" in value ? [{ ...common, date: value.startDate, end_date: value.endDate }]
    : [{ ...common, date: value.date, end_date: value.date }];
  const supabase = await createClient();
  // One INSERT keeps a selection atomic, including concurrent overlap conflicts.
  const { data, error } = await supabase.from("studio_days_off").insert(rows).select(STUDIO_DAY_OFF_COLUMNS);
  if (error || !data) return NextResponse.json({ success: false, code: error?.code === "23P01" || error?.code === "23505" ? "overlap" : "unavailable" }, { status: error?.code === "23P01" || error?.code === "23505" ? 409 : 500 });
  scheduleAutomaticLabor(membership.studio_id);
  return NextResponse.json({ success: true, daysOff: data, ...(data.length === 1 ? { dayOff: data[0] } : {}) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const membership = await getActiveStudioMembership();
  if (!membership || membership.system_role !== "admin") return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, code: "invalid" }, { status: 400 }); }
  const parsed = studioDaysOffDeleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, code: "invalid" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("studio_days_off").delete().eq("studio_id", membership.studio_id).in("id", parsed.data.ids).select("id");
  if (error || !data) return NextResponse.json({ success: false, code: "unavailable" }, { status: 500 });
  scheduleAutomaticLabor(membership.studio_id);
  return NextResponse.json({ success: true, ids: data.map((row) => row.id) });
}
