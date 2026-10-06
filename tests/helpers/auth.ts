import { expect, test, type Page } from "@playwright/test";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";

// Feature tests need a genuine session, without racing the login page's hydration.
// Accounts are still created by each spec's local fixture and removed in teardown.
export async function signInLocalTestUser(page: Page, credentials: { email: string; password: string }) {
  const config = z.object({
    EQUIPMENT_TEST_SUPABASE_URL: z.url(),
    EQUIPMENT_TEST_PUBLISHABLE_KEY: z.string().min(1),
  }).parse(process.env);
  const origin = new URL(z.url().parse(test.info().project.use.baseURL)).origin;
  for (const target of [config.EQUIPMENT_TEST_SUPABASE_URL, origin]) {
    if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname)) {
      throw new Error("Browser auth fixtures require local Supabase and a local application");
    }
  }
  let cookies: Parameters<NonNullable<CookieMethodsServer["setAll"]>>[0] = [];
  const auth = createServerClient<Database>(config.EQUIPMENT_TEST_SUPABASE_URL, config.EQUIPMENT_TEST_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookies,
      setAll: values => { cookies = values; },
    },
  });
  const result = await auth.auth.signInWithPassword(credentials);
  if (result.error) throw new Error(`Local fixture password login failed (${result.error.status}: ${result.error.code})`);
  if (!result.data.session || !result.data.user) throw new Error("Local fixture login did not return a session");
  await page.context().clearCookies({ name: /^sb-.*-auth-token(?:\.\d+)?$/ });
  await page.context().addCookies(cookies.filter(cookie => cookie.value && cookie.options.maxAge !== 0).map(({ name, value, options }) => ({
    name, value, url: origin,
    httpOnly: options.httpOnly ?? false,
    secure: options.secure ?? false,
    sameSite: options.sameSite === "strict" ? "Strict" : options.sameSite === "none" ? "None" : "Lax",
    ...(options.maxAge === undefined ? {} : { expires: Math.floor(Date.now() / 1000) + options.maxAge }),
  })));
  // The normal app boundary verifies the cookie with getUser() and membership/RLS.
  await page.goto("/dashboard");
  await expect(page, "Fixture session must be accepted by the application's normal auth boundary").toHaveURL(/\/dashboard(?:[/?#]|$)/);
}
