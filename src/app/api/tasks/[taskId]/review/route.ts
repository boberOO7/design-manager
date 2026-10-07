import { NextResponse } from "next/server";
import { z } from "zod";
import { updateTaskReviewMutation } from "@/data/mutations/task-review";
import { getTaskReviewCandidates } from "@/data/queries/task-reviews";

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const body: unknown = await request.json().catch(() => null);
  const { taskId } = await params;
  const result = await updateTaskReviewMutation(taskId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!z.uuid().safeParse(taskId).success) return NextResponse.json({ success: false }, { status: 400 });
  const reviewers = await getTaskReviewCandidates(taskId);
  return reviewers ? NextResponse.json({ reviewers }) : NextResponse.json({ success: false }, { status: 403 });
}
