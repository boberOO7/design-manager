import { NextResponse } from "next/server";
import { bulkMoveTaskStatusesMutation } from "@/data/mutations/task-status";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ formError: "Choose a valid batch and destination status." }, { status: 400 });
  }
  const { projectId } = await params;
  const result = await bulkMoveTaskStatusesMutation(projectId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
