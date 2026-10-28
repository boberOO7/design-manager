import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { feedbackTemplateSchema } from "@/lib/feedback-template";

const schema = z.strictObject({ config: feedbackTemplateSchema, revision: z.number().int().nonnegative(), publish: z.boolean() });
export async function PUT(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = await getActiveStudioAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const client = await createClient();
  const { data, error } = await client.rpc("save_feedback_template", { p_studio_id: admin.studio_id, p_config: parsed.data.config, p_revision: parsed.data.revision, p_publish: parsed.data.publish });
  if (error) return NextResponse.json({ error: error.code === "40001" ? "conflict" : "save" }, { status: error.code === "40001" ? 409 : 400 });
  revalidatePath("/admin/client-survey");
  return NextResponse.json({ revision: data }, { headers: { "Cache-Control": "no-store" } });
}
