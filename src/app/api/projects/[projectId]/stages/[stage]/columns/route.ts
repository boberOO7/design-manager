import { NextResponse } from "next/server";
import { updateProjectStageColumns } from "@/data/mutations/project-stage-columns";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; stage: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ formError: "Choose valid stage columns." }, { status: 400 }); }
  const { projectId, stage } = await params;
  const statuses = typeof body === "object" && body !== null && "enabled_statuses" in body ? body.enabled_statuses : undefined;
  const result = await updateProjectStageColumns(projectId, stage, statuses);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
