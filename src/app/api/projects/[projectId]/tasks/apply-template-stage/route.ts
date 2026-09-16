import { NextResponse } from "next/server";
import { applyProjectTemplateStageMutation } from "@/data/mutations/task-status";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ formError: "Choose a valid project template and source stage." }, { status: 400 });
  }

  const { projectId } = await params;
  const result = await applyProjectTemplateStageMutation(projectId, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
