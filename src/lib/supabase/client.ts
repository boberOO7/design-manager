import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { authCookieOptions, SESSION_ONLY_COOKIE } from "@/lib/supabase/session-cookie-policy";

export function setRememberMe(remember: boolean) {
  document.cookie = serializeCookieHeader(SESSION_ONLY_COOKIE, remember ? "" : "1", {
    path: "/",
    sameSite: "lax",
    ...(remember ? { maxAge: 0 } : {}),
  });
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => typeof document === "undefined" ? [] : parseCookieHeader(document.cookie),
        setAll(cookiesToSet) {
          if (typeof document === "undefined") return;
          const sessionOnly = parseCookieHeader(document.cookie).some(({ name, value }) => name === SESSION_ONLY_COOKIE && value === "1");
          cookiesToSet.forEach(({ name, value, options }) => {
            document.cookie = serializeCookieHeader(name, value, authCookieOptions(options, sessionOnly));
          });
        },
      },
    },
  );
}
