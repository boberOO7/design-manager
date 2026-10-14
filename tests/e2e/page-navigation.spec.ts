import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";
import en from "../../messages/en.json";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local navigation fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const account = { id: "", email: `navigation-${randomUUID()}@example.test`, password: `Navigation-${randomUUID()}` };
const feedback = '[data-navigation-feedback]';
const main = '#main-content';

declare global {
  interface Window {
    navigationSamples: { path: string; state: string | undefined; y: number; height: number; scrollHeight: number }[];
    interruptNavigationReveal?: "focus" | "pointer";
  }
}

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Navigation browser checks" }).throwOnError();
  const created = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
  if (created.error) throw created.error;
  account.id = created.data.user.id;
  await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: "Navigation admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: "admin", is_active: true }).throwOnError();
});

test.afterAll(async () => {
  // Studio deletion is deliberately unavailable through PostgREST, even to service_role.
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: `begin; set local session_replication_role=replica;
      delete from private.finance_labor_membership_events where studio_id='${z.uuid().parse(studioId)}';
      set local session_replication_role=origin;
      delete from public.studios where id='${z.uuid().parse(studioId)}'; commit;`, stdio: ["pipe", "ignore", "pipe"],
  });
  if (account.id) {
    const result = await service.auth.admin.deleteUser(account.id);
    if (result.error) throw result.error;
  }
});

async function login(page: Page) {
  await page.addInitScript(() => {
    window.navigationSamples = [];
    const capture = () => {
      const root = document.querySelector<HTMLElement>("#main-content");
      const content = root?.firstElementChild;
      if (!root || !(content instanceof HTMLElement)) return;
      const style = getComputedStyle(content);
      const y = new DOMMatrixReadOnly(style.transform).m42;
      window.navigationSamples.push({ path: location.pathname, state: root.dataset.pageNavigation, y, height: root.clientHeight, scrollHeight: root.scrollHeight });
      if (root.dataset.pageNavigation === "revealing" && window.interruptNavigationReveal) {
        const interrupt = window.interruptNavigationReveal;
        delete window.interruptNavigationReveal;
        if (interrupt === "focus") root.focus();
        else root.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      }
    };
    new MutationObserver(capture).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-page-navigation", "style"] });
  });
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: String(test.info().project.use.baseURL) }]);
  await signInLocalTestUser(page, account);
  await page.waitForLoadState("networkidle");
}

async function holdNavigation(page: Page, path: string) {
  let release = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === path, async route => {
    if (route.request().headers().rsc === "1" && route.request().headers()["next-router-prefetch"] !== "1") await waiting;
    await route.continue();
  });
  return release;
}

async function navigate(page: Page, path: string) {
  await page.locator(`aside nav a[href="${path}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.locator(feedback)).toHaveAttribute("data-navigation-feedback", "idle");
  await expect(page.locator(main)).toHaveAttribute("data-page-navigation", "ready");
}

test("fast pages give immediate feedback, reveal once and leave Dashboard's motion in charge", async ({ page }) => {
  await login(page);
  const before = await page.locator(main).boundingBox();
  const release = await holdNavigation(page, "/team");
  try {
    const team = page.locator('aside a[href="/team"]');
    await team.focus();
    await team.press("Enter");
    await expect(page.locator(feedback)).toHaveAttribute("data-navigation-feedback", "pending");
    await expect(page.locator(feedback)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.Dashboard.title);
    expect(await page.locator(main).boundingBox()).toEqual(before);
    await expect(team).toBeFocused();
  } finally { release(); }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.Team.title);
  await expect(page.locator(feedback)).toHaveAttribute("data-navigation-feedback", "idle");
  await expect(page.locator(main)).toHaveAttribute("data-page-navigation", "ready");
  await navigate(page, "/contractors");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.Contractors.title);
  const samples = await page.evaluate(() => window.navigationSamples);
  for (const path of ["/team", "/contractors"]) {
    const arrivals = samples.filter(sample => sample.path === path);
    expect(arrivals.some(sample => sample.state === "revealing" && sample.y > 0 && sample.y <= 4)).toBe(true);
    expect(new Set(arrivals.map(sample => sample.height)).size).toBe(1);
  }
  await navigate(page, "/dashboard");
  await expect(page.locator('[data-dashboard-ready]').first()).toBeVisible();
  expect(await page.evaluate(() => window.navigationSamples.filter(sample => sample.path === "/dashboard" && sample.state === "revealing"))).toEqual([]);
});

test("rapid navigation and browser history settle on the current route", async ({ page }) => {
  await login(page);
  const release = await holdNavigation(page, "/team");
  try {
    await page.locator('aside a[href="/team"]').click();
    await expect(page.locator(feedback)).toHaveAttribute("data-navigation-feedback", "pending");
    await navigate(page, "/contractors");
  } finally { release(); }
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/contractors$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.Contractors.title);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator(feedback)).toHaveAttribute("data-navigation-feedback", "idle");
  await page.goForward();
  await expect(page).toHaveURL(/\/contractors$/);
  await expect(page.locator(feedback)).toHaveAttribute("data-navigation-feedback", "idle");
});

for (const preference of ["reduce", "off"] as const) {
  test(`motion ${preference} keeps feedback static and ready content still`, async ({ page }) => {
    if (preference === "reduce") await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    if (preference === "off") await page.evaluate(() => { document.documentElement.dataset.motion = "off"; });
    const release = await holdNavigation(page, "/team");
    try {
      await page.locator('aside a[href="/team"]').click();
      await expect(page.locator(feedback)).toBeVisible();
      expect(await page.locator(`${feedback} > span`).evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    } finally { release(); }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.Team.title);
    await navigate(page, "/contractors");
    expect(await page.evaluate(() => window.navigationSamples.filter(sample => ["/team", "/contractors"].includes(sample.path) && sample.y !== 0))).toEqual([]);
  });
}

test("focus and pointer interaction finish the reveal without hiding content", async ({ page }) => {
  await login(page);
  for (const [path, interrupt] of [["/team", "focus"], ["/contractors", "pointer"]] as const) {
    await page.evaluate(value => { window.interruptNavigationReveal = value; }, interrupt);
    await navigate(page, path);
    expect(await page.locator(`${main} > div`).first().evaluate(element => getComputedStyle(element).transform)).toBe("none");
    if (interrupt === "focus") await expect(page.locator(main)).toBeFocused();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("mobile links, hash navigation and modified clicks retain native behavior", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: en.Navigation.open, exact: true }).click();
  const release = await holdNavigation(page, "/team");
  try {
    await page.locator('#mobile-application-navigation a[href="/team"]').click();
    await expect(page.locator(feedback)).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(feedback)).toBeVisible();
  } finally { release(); }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.Team.title);
  await expect(page.locator(feedback)).toHaveAttribute("data-navigation-feedback", "idle");
  await page.locator('a[href="#main-content"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(feedback)).toHaveAttribute("data-navigation-feedback", "idle");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('aside a[href="/contractors"]').dispatchEvent("click", { ctrlKey: true, button: 0 });
  await expect(page.locator(feedback)).toHaveAttribute("data-navigation-feedback", "idle");
});
