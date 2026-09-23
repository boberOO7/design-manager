import { NextResponse } from "next/server";
import { updateProjectStageConfiguration } from "@/data/mutations/project-stage-columns";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Choose valid project stages." }, { status: 400 }); }
  const { projectId } = await params;
  const stages = typeof body === "object" && body !== null && "stages" in body ? body.stages : undefined;
  const includeInProductivity = typeof body === "object" && body !== null && "include_in_productivity" in body ? body.include_in_productivity : undefined;
  const showProgress = typeof body === "object" && body !== null && "show_progress" in body ? body.show_progress : undefined;
  const result = await updateProjectStageConfiguration(projectId, stages, includeInProductivity, showProgress);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
