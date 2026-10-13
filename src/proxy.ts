import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";
import { DASHBOARD_TRACE_ID_HEADER, DASHBOARD_TRACE_START_HEADER, isDashboardTraceRequest } from "./lib/dashboard-trace-request";
import { isProjectsPrefetchRequest, PROJECTS_PREFETCH_HEADER } from "./lib/projects-prefetch-request";

export async function proxy(request: NextRequest) {
  request.headers.delete(PROJECTS_PREFETCH_HEADER);
  if (isProjectsPrefetchRequest(request.nextUrl.pathname, request.method, request.headers)) {
    request.headers.set(PROJECTS_PREFETCH_HEADER, "1");
  }
  // Overwrite client-supplied trace metadata; only ordinary Dashboard GETs are traced.
  request.headers.delete(DASHBOARD_TRACE_ID_HEADER);
  request.headers.delete(DASHBOARD_TRACE_START_HEADER);
  if (process.env.STUDIOFLOW_DASHBOARD_TRACE === "1" && isDashboardTraceRequest(request.nextUrl.pathname, request.method, request.headers)) {
    request.headers.set(DASHBOARD_TRACE_ID_HEADER, crypto.randomUUID());
    request.headers.set(DASHBOARD_TRACE_START_HEADER, String(Date.now()));
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
