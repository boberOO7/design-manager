import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";
import { isProjectsPrefetchRequest, PROJECTS_PREFETCH_HEADER } from "./lib/projects-prefetch-request";

export async function proxy(request: NextRequest) {
  request.headers.delete(PROJECTS_PREFETCH_HEADER);
  if (isProjectsPrefetchRequest(request.nextUrl.pathname, request.method, request.headers)) {
    request.headers.set(PROJECTS_PREFETCH_HEADER, "1");
  }
  // Public capability routes need no auth refresh and must never leak tokens via referrers/cache.
  const shortSurvey = request.nextUrl.pathname.startsWith("/f/");
  if (shortSurvey || request.nextUrl.pathname.startsWith("/survey/") || request.nextUrl.pathname.startsWith("/api/feedback/")) {
    const destination = request.nextUrl.clone();
    destination.pathname = destination.pathname.replace(/^\/f\//, "/survey/");
    const response = shortSurvey ? NextResponse.rewrite(destination) : NextResponse.next();
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    const preview = request.nextUrl.pathname === "/survey/preview";
    response.headers.set("X-Frame-Options", preview ? "SAMEORIGIN" : "DENY");
    response.headers.set("Content-Security-Policy", preview ? "frame-ancestors 'self'" : "frame-ancestors 'none'");
    return response;
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
