import { processMetaLeadQueue } from "@/lib/meta-leads/queue";
import { authorizedMetaWorker } from "@/lib/meta-leads/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorizedMetaWorker(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await processMetaLeadQueue(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Meta lead worker unavailable" }, { status: 503 });
  }
}
