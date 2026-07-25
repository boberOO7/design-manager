import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        },
      },
    }
  );

  // Refresh and verify the session
  // We use getClaims() as requested to refresh and verify the session.
  // This will update the cookies via the setAll handler.
  await supabase.auth.getClaims();

  return supabase;
}