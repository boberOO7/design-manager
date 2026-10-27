import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { getProjectStageConfiguration } from "@/data/queries/project-stage-columns";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { updateProjectStageConfiguration } from "@/data/mutations/project-stage-columns";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, formError: "Choose valid project stages." }, { status: 400 }); }
  const { projectId } = await params;
  const stages = typeof body === "object" && body !== null && "stages" in body ? body.stages : undefined;
  const includeInProductivity = typeof body === "object" && body !== null && "include_in_productivity" in body ? body.include_in_productivity : undefined;
  const showProgress = typeof body === "object" && body !== null && "show_progress" in body ? body.show_progress : undefined;
  const extra = z.object({ expected_version: z.number().int().nonnegative(), deleted_task_ids: z.array(z.uuid()) }).safeParse(body);
  if (!extra.success) return NextResponse.json({ success: false, errorCode: "invalid_configuration" }, { status: 400 });
  const result = await updateProjectStageConfiguration(projectId, stages, includeInProductivity, showProgress, extra.data.expected_version, extra.data.deleted_task_ids);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const admin = await getActiveStudioAdmin();
  if (!admin) return NextResponse.json({ success: false }, { status: 403 });
  const project = await getProjectById(projectId);
  if (!project || project.studio_id !== admin.studio_id) return NextResponse.json({ success: false }, { status: 404 });
  const supabase = await createClient();
  const [configuration, info] = await Promise.all([getProjectStageConfiguration(projectId), supabase.rpc("get_project_stage_deletion_info", { p_project_id: projectId })]);
  if (info.error) return NextResponse.json({ success: false }, { status: 400 });
  return NextResponse.json({ success: true, configuration, deletionInfo: info.data });
}
