import { NextResponse } from "next/server";
import { updateTaskCorrectionMutation } from "@/data/mutations/task-correction";
import { getTaskCorrectionCandidates } from "@/data/queries/task-reviews";

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const result = await updateTaskCorrectionMutation(taskId, await request.json().catch(() => null));
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const people = await getTaskCorrectionCandidates(taskId);
  return people ? NextResponse.json({ reviewers: people }) : NextResponse.json({ success: false }, { status: 403 });
}
