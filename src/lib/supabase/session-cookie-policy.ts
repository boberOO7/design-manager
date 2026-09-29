import type { CookieOptions } from "@supabase/ssr";

export const SESSION_ONLY_COOKIE = "studioflow-session-only";

export function authCookieOptions(options: CookieOptions, sessionOnly: boolean): CookieOptions {
  if (!sessionOnly || options.maxAge === 0) return options;
  const { maxAge: _maxAge, expires: _expires, ...sessionOptions } = options;
  return sessionOptions;
}
