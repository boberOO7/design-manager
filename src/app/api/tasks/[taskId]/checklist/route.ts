import { NextResponse } from "next/server";
import { setTaskChecklistTemplate } from "@/data/mutations/task-progress";

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ formError: "Choose a valid checklist template." }, { status: 400 }); }
  const { taskId } = await params;
  const result = await setTaskChecklistTemplate(taskId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
