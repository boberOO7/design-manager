import { NextResponse } from "next/server";
import { setProjectStageSchedulePausedMutation } from "@/data/mutations/task-status";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const body: unknown = await request.json().catch(() => null);
  const { projectId } = await params;
  const result = await setProjectStageSchedulePausedMutation(projectId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
