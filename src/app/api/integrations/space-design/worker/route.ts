import { processSpaceDesignQueue } from "@/lib/space-design/queue";
import { authorizedSpaceDesignWorker } from "@/lib/space-design/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!authorizedSpaceDesignWorker(request)) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    return Response.json(await processSpaceDesignQueue(), { headers });
  } catch {
    return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers });
  }
}
