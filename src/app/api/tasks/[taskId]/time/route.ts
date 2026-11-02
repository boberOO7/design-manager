import { NextResponse } from "next/server";
import { z } from "zod";
import { getTaskWorkTime } from "@/data/queries/task-work-time";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!z.uuid().safeParse(taskId).success) return NextResponse.json({ error: "Invalid task" }, { status: 400 });
  try {
    const report = await getTaskWorkTime(taskId);
    return NextResponse.json(report, { status: report ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to load task time", error);
    return NextResponse.json({ error: "Unable to load task time" }, { status: 500 });
  }
}
