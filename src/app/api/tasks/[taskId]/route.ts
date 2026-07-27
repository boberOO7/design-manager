import { NextResponse } from "next/server";
import { updateTaskDetailsMutation } from "@/data/mutations/task-edit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ formError: "Please correct the highlighted fields." }, { status: 400 });
  }

  const { taskId } = await params;
  const result = await updateTaskDetailsMutation(taskId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
