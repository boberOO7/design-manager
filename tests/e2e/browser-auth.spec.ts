import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import en from "../../messages/en.json";
import { signInLocalTestUser } from "../helpers/auth";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local auth fixtures only");
const service = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID();
const actor = { id: "", email: `browser-auth-${randomUUID()}@example.test`, password: `Browser-${randomUUID()}` };

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studio, name: "Browser auth fixture" }).throwOnError();
  const created = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (created.error) throw created.error;
  actor.id = created.data.user.id;
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Browser test admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: "admin", is_active: true }).throwOnError();
});

test.afterAll(async () => {
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: `delete from studio_members where studio_id='${studio}';delete from studios where id='${studio}';`,
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (actor.id) { const deleted = await service.auth.admin.deleteUser(actor.id); if (deleted.error) throw deleted.error; }
});

test("fresh local browser sessions authenticate, restore state, and open Finance", async ({ browser }, testInfo) => {
  const baseURL = z.url().parse(testInfo.project.use.baseURL);
  const anonymous = await browser.newContext({ baseURL });
  try {
    const page = await anonymous.newPage();
    await page.goto("/finance");
    await expect(page).toHaveURL(/\/login$/);
    await expect(signInLocalTestUser(page, { ...actor, password: `Wrong-${randomUUID()}` })).rejects.toThrow("Local fixture password login failed (400: invalid_credentials)");
    expect((await anonymous.cookies()).filter(cookie => cookie.name.includes("auth-token"))).toHaveLength(0);
  } finally { await anonymous.close(); }

  const authenticated = await browser.newContext({ baseURL });
  const storageState = await (async () => {
    try {
      const page = await authenticated.newPage();
      await signInLocalTestUser(page, actor);
      await page.goto("/finance");
      await expect(page).toHaveURL(/\/finance$/);
      await expect(page.getByRole("heading", { name: en.Finance.title, exact: true })).toBeVisible();
      expect((await authenticated.cookies()).some(cookie => cookie.name.includes("auth-token") && cookie.domain === new URL(baseURL).hostname)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("authenticated-finance.png") });
      return await authenticated.storageState();
    } finally { await authenticated.close(); }
  })();

  // No persisted credential file or state from a previous DB run is involved.
  const restored = await browser.newContext({ baseURL, storageState });
  try {
    const page = await restored.newPage();
    await page.goto("/finance");
    await expect(page).toHaveURL(/\/finance$/);
    await expect(page.getByRole("heading", { name: en.Finance.title, exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/finance$/);
  } finally { await restored.close(); }
});
