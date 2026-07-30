import { NextResponse } from "next/server";
import { updateTaskProductionProgress } from "@/data/mutations/task-progress";

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ formError: "Enter a valid production percentage." }, { status: 400 }); }
  const { taskId } = await params;
  const result = await updateTaskProductionProgress(taskId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
