import { NextResponse } from "next/server";
import { getTeamActivity } from "@/data/queries/team-activity";
import { teamActivityMonthSchema } from "@/lib/team-activity";

export async function GET(request: Request) {
  const month = teamActivityMonthSchema.safeParse(new URL(request.url).searchParams.get("month"));
  if (!month.success) return NextResponse.json({ success: false }, { status: 400 });
  try {
    const report = await getTeamActivity(month.data);
    return NextResponse.json(report ?? { success: false }, { status: report ? 200 : 403, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to load team activity", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
