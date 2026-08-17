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

  // Keep this immediately after createServerClient. getClaims() validates and
  // refreshes the token; setAll() then makes its replacement visible both to
  // this request's Server Components and to the browser response.
  //
  // Auth failures deliberately do not redirect here. The app boundary handles
  // them separately from authenticated users with no active studio membership.
  await supabase.auth.getClaims();

  return response;
}
