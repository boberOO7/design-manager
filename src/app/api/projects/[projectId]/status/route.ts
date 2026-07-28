import { NextResponse } from "next/server";
import { updateProjectLifecycleStatus } from "@/data/mutations/project-lifecycle";
import { projectLifecycleStatusPayloadSchema } from "@/lib/validation/project-lifecycle";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ formError: "Choose a valid project lifecycle action." }, { status: 400 }); }
  const payload = projectLifecycleStatusPayloadSchema.safeParse(body);
  if (!payload.success) return NextResponse.json({ formError: "Choose a valid project lifecycle action." }, { status: 400 });
  const { projectId } = await params;
  const result = await updateProjectLifecycleStatus(projectId, payload.data.status);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
