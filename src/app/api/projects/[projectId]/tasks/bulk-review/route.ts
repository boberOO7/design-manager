import { NextResponse } from "next/server";
import { bulkUpdateTaskReviewMutation } from "@/data/mutations/task-review";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const body: unknown = await request.json().catch(() => null);
  const { projectId } = await params;
  const result = await bulkUpdateTaskReviewMutation(projectId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
