import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.strictObject({ expiresAt: z.iso.datetime({ offset: true }) });
const revokeSchema = z.strictObject({ invitationId: z.uuid() });
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return json({ error: "forbidden" }, 403);
  const { projectId } = await params;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(projectId).success || !parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) return json({ error: "invalid" }, 400);
  const client = await createClient();
  // Resolve the project in caller context, including the canonical active studio.
  const { data: project, error: projectError } = await client.from("projects").select("id").eq("id", projectId).eq("studio_id", admin.studio_id).maybeSingle();
  if (projectError) return json({ error: "save" }, 500);
  if (!project) return json({ error: "forbidden" }, 403);
  const { error } = await client.rpc("create_project_feedback", { p_project_id: projectId, p_expires_at: parsed.data.expiresAt });
  if (error) return json({ error: "save" }, 400);
  return json({ ok: true }, 201);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return json({ error: "forbidden" }, 403);
  const { projectId } = await params;
  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(projectId).success || !parsed.success) return json({ error: "invalid" }, 400);
  const client = await createClient();
  const { data, error: readError } = await client.from("project_feedback").select("id").eq("id", parsed.data.invitationId).eq("project_id", projectId).eq("studio_id", admin.studio_id).maybeSingle();
  if (readError) return json({ error: "save" }, 500);
  if (!data) return json({ error: "forbidden" }, 403);
  const { error } = await client.rpc("revoke_project_feedback", { p_invitation_id: data.id });
  if (error) return json({ error: "save" }, 400);
  return json({ ok: true });
}
