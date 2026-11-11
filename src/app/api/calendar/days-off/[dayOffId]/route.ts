import { NextResponse } from "next/server";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { scheduleAutomaticLabor } from "@/lib/finance-automatic-labor";
import { STUDIO_DAY_OFF_COLUMNS } from "@/lib/studio-days-off";
import { studioDayOffUpdateSchema } from "@/lib/validation/studio-days-off";

type Context = { params: Promise<{ dayOffId: string }> };

export async function PATCH(request: Request, context: Context) {
  const membership = await getActiveStudioMembership();
  if (!membership || membership.system_role !== "admin") return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, code: "invalid" }, { status: 400 }); }
  const parsed = studioDayOffUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, code: "invalid" }, { status: 400 });
  const value = parsed.data;
  const update = { name: value.name, note: value.note,
    date: "startDate" in value ? value.startDate : value.date,
    end_date: "endDate" in value ? value.endDate : value.date };
  const { dayOffId } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("studio_days_off").update(update).eq("id", dayOffId).eq("studio_id", membership.studio_id).select(STUDIO_DAY_OFF_COLUMNS).maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, code: error?.code === "23P01" || error?.code === "23505" ? "overlap" : "unavailable" }, { status: error?.code === "23P01" || error?.code === "23505" ? 409 : error ? 500 : 404 });
  scheduleAutomaticLabor(membership.studio_id);
  return NextResponse.json({ success: true, dayOff: data, daysOff: [data] });
}

export async function DELETE(_request: Request, context: Context) {
  const membership = await getActiveStudioMembership();
  if (!membership || membership.system_role !== "admin") return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  const { dayOffId } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("studio_days_off").delete().eq("id", dayOffId).eq("studio_id", membership.studio_id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, code: "unavailable" }, { status: error ? 500 : 404 });
  scheduleAutomaticLabor(membership.studio_id);
  return NextResponse.json({ success: true, id: data.id });
}
