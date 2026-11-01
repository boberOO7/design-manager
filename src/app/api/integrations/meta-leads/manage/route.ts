import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { metaId, metaMutationSchema, META_BATCH_SIZE } from "@/lib/meta-leads/contracts";
import { MetaLeadError } from "@/lib/meta-leads/graph";
import { enqueueMetaImport, getMetaAvailability, getMetaForms, getMetaJobStates, getMetaPreview, MetaManagementError, planMetaImport, requireMetaAdmin, setMetaFormSync, setMetaLeadExclusion } from "@/lib/meta-leads/management";
import { processMetaLeadQueue } from "@/lib/meta-leads/queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });

function failure(error: unknown) {
  if (error instanceof MetaManagementError)
    return json({ error: error.code }, error.status);
  if (error instanceof MetaLeadError)
    return json({ error: error.code }, 503);
  return json({ error: "unavailable" }, 503);
}

export async function GET(request: Request) {
  try {
    const context = await requireMetaAdmin();
    const params = new URL(request.url).searchParams;
    const operation = z.enum(["forms", "availability", "preview", "status"]).safeParse(params.get("operation") ?? "forms");
    const afterCursor = z.string().max(2000).optional().safeParse(params.get("after") ?? undefined);
    if (!operation.success || !afterCursor.success)
      return json({ error: "invalid_request" }, 400);
    if (operation.data === "forms")
      return json(await getMetaForms(context, afterCursor.data));
    const formId = metaId.safeParse(params.get("formId"));
    if (!formId.success)
      return json({ error: "invalid_request" }, 400);
    if (operation.data === "availability")
      return json(await getMetaAvailability(context, formId.data, afterCursor.data));
    if (operation.data === "preview")
      return json(await getMetaPreview(context, formId.data, afterCursor.data));
    const ids = z.array(metaId).min(1).max(META_BATCH_SIZE).safeParse((params.get("ids") ?? "").split(","));
    if (!ids.success)
      return json({ error: "invalid_request" }, 400);
    return json({ kind: "status", jobs: await getMetaJobStates(context, formId.data, ids.data) });
  }
  catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
      return json({ error: "permission" }, 403);
    const context = await requireMetaAdmin();
    const input = metaMutationSchema.safeParse(await request.json().catch(() => null));
    if (!input.success)
      return json({ error: "invalid_request" }, 400);
    const value = input.data;
    if (value.action === "sync") {
      await setMetaFormSync(context, value.formId, value.enabled);
      return json({ kind: "saved" });
    }
    if (value.action === "exclude") {
      await setMetaLeadExclusion(context, value.formId, value.leadId, value.excluded);
      return json({ kind: "saved" });
    }
    if (value.action === "plan")
      return json(await planMetaImport(context, value.formId, value.leadIds));
    if (value.action === "enqueue") {
      const result = await enqueueMetaImport(context, value.formId, value.leadIds);
      return json(result);
    }
    // Explicit, scoped manual processing also works while production Cron is
    // intentionally inactive. Preview/status GETs never enqueue or process jobs.
    await planMetaImport(context, value.formId, value.leadIds);
    after(async () => {
      try {
        await processMetaLeadQueue(value.leadIds);
        revalidatePath("/crm/leads");
      }
      catch {
        console.error("Meta manual worker failed; durable jobs remain queued.");
      }
    });
    return json({ kind: "status", jobs: await getMetaJobStates(context, value.formId, value.leadIds) });
  }
  catch (error) {
    return failure(error);
  }
}
