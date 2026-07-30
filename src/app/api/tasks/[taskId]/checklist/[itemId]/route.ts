import { NextResponse } from "next/server";
import { deleteChecklistItem, updateChecklistItem } from "@/data/mutations/task-progress";

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string; itemId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ formError: "Enter a valid checklist change." }, { status: 400 }); }
  const { taskId, itemId } = await params;
  const result = await updateChecklistItem(taskId, itemId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ taskId: string; itemId: string }> }) {
  const { taskId, itemId } = await params;
  const result = await deleteChecklistItem(taskId, itemId);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
