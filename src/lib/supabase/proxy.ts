import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // This network-backed check both refreshes valid sessions and distinguishes a
  // stale JWT from a current Auth user. The cookie adapter above ensures any
  // refreshed or cleared cookies are sent back to the browser.
  const { data, error } = await supabase.auth.getUser();
  if (!data.user && error && error.status && error.status >= 400 && error.status < 500) {
    await supabase.auth.signOut({ scope: "local" });
  }

  return response;
}
