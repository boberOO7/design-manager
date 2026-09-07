import { NextResponse } from "next/server";
import { bulkSetSelectedTaskDeadlineMutation } from "@/data/mutations/task-status";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ formError: "Choose a valid task batch, workflow step, and deadline." }, { status: 400 });
  }
  const { projectId } = await params;
  const result = await bulkSetSelectedTaskDeadlineMutation(projectId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
