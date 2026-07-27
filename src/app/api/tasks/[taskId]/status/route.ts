import { NextResponse } from "next/server";
import { updateTaskStatusMutation } from "@/data/mutations/task-status";
import { toTaskStatusActionState } from "@/lib/task-status-mutation";
import { taskStatusPayloadSchema } from "@/lib/validation/task";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ formError: "Choose a valid task status." }, { status: 400 });
  }

  const payload = taskStatusPayloadSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ formError: "Choose a valid task status." }, { status: 400 });
  }

  const { taskId } = await params;
  const result = await updateTaskStatusMutation({
    task_id: taskId,
    status: payload.data.status,
  });
  const response = toTaskStatusActionState(result);

  return NextResponse.json(response, { status: result.success ? 200 : 400 });
}
