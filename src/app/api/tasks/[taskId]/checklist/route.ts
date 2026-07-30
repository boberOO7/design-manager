import { NextResponse } from "next/server";
import { createChecklistItem } from "@/data/mutations/task-progress";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ formError: "Enter a valid checklist item." }, { status: 400 }); }
  const { taskId } = await params;
  const result = await createChecklistItem(taskId, body);
  return NextResponse.json(result, { status: result.success ? 201 : 400 });
}
