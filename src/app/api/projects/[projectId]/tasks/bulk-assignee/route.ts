import { NextResponse } from "next/server";
import { bulkAssignTaskStageMutation } from "@/data/mutations/task-status";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ formError: "Choose a valid stage, project member, and assignment scope." }, { status: 400 });
  }
  const { projectId } = await params;
  const result = await bulkAssignTaskStageMutation(projectId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
