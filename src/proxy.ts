import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";
import { isProjectsPrefetchRequest, PROJECTS_PREFETCH_HEADER } from "./lib/projects-prefetch-request";

export async function proxy(request: NextRequest) {
  request.headers.delete(PROJECTS_PREFETCH_HEADER);
  if (isProjectsPrefetchRequest(request.nextUrl.pathname, request.method, request.headers)) {
    request.headers.set(PROJECTS_PREFETCH_HEADER, "1");
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
