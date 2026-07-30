import { NextResponse } from "next/server";
import { updateProjectProgressMethod } from "@/data/mutations/project-progress-settings";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ formError: "Choose a valid progress method." }, { status: 400 }); }
  const { projectId } = await params;
  const result = await updateProjectProgressMethod(projectId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
