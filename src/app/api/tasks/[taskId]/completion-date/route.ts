import { NextResponse } from "next/server";
import { updateTaskCompletionDateMutation } from "@/data/mutations/task-edit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, formError: "Please correct the highlighted fields.", fieldErrors: {} }, { status: 400 });
  }

  const { taskId } = await params;
  const result = await updateTaskCompletionDateMutation(taskId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
