import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const url = request.url;
  
  const excludedPaths = [
    "/_next/",
    "/_next/static",
    "/_next/image",
    "/favicon.ico",
    ".svg",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
  ];

  if (excludedPaths.some(pattern => url.includes(pattern))) {
    return NextResponse.next();
  }

  return updateSession(request);
}
