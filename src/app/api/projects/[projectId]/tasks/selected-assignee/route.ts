import { NextResponse } from "next/server";
import { bulkAssignSelectedTasksMutation } from "@/data/mutations/task-status";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ formError: "Choose a valid task batch and project member." }, { status: 400 });
  }
  const { projectId } = await params;
  const result = await bulkAssignSelectedTasksMutation(projectId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
