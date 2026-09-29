import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { ApplicationDatabase } from "@/types/application-database";
import { authCookieOptions, SESSION_ONLY_COOKIE } from "@/lib/supabase/session-cookie-policy";

export async function createClient() {
  const cookieStore = await cookies();
  const sessionOnly = cookieStore.get(SESSION_ONLY_COOKIE)?.value === "1";

  return createServerClient<ApplicationDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, authCookieOptions(options, sessionOnly));
            });
          } catch {
            // Server Components можуть читати cookies,
            // але не завжди можуть їх змінювати.
            // Оновлення сесії пізніше виконуватиме proxy.
          }
        },
      },
    },
  );
}
