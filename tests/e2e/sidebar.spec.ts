import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local navigation fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const projectId = randomUUID();
const actor = { id: "", email: `sidebar-${randomUUID()}@example.test`, password: `Navigation-${randomUUID()}` };

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Sidebar polish check" }).throwOnError();
  const created = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (created.error) throw created.error;
  actor.id = created.data.user.id;
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Navigation admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studioId, user_id: actor.id, system_role: "admin", is_active: true }).throwOnError();
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: `insert into public.projects(id,studio_id,name,status,total_area_m2,start_date,created_by) values ('${z.uuid().parse(projectId)}','${z.uuid().parse(studioId)}','Navigation Kanban','active',100,'2026-11-01','${z.uuid().parse(actor.id)}');`,
    stdio: ["pipe", "ignore", "pipe"],
  });
});

test.afterAll(async () => {
  // Same local-only cleanup as the existing page-navigation checks.
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: `begin; set local session_replication_role=replica;
      delete from private.finance_labor_membership_events where studio_id='${z.uuid().parse(studioId)}';
      set local session_replication_role=origin;
      delete from public.projects where id='${z.uuid().parse(projectId)}';
      delete from public.studios where id='${z.uuid().parse(studioId)}'; commit;`, stdio: ["pipe", "ignore", "pipe"],
  });
  if (actor.id) {
    const result = await service.auth.admin.deleteUser(actor.id);
    if (result.error) throw result.error;
  }
});

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator("[data-app-sidebar]")).toBeVisible();
}

test("final sidebar keeps header, content and icons stationary through hover and scrolling", async ({ page }) => {
  // Old experiment preferences must no longer affect the final navigation.
  await page.addInitScript(() => localStorage.setItem("studioflow-sidebar-variant", "flyout"));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: String(test.info().project.use.baseURL) }]);
  await signInLocalTestUser(page, actor);
  const sidebar = page.locator("[data-app-sidebar]");
  const panel = page.locator("[data-sidebar-panel]");
  for (const [name, path] of [["calendar", "/calendar"], ["project", `/projects/${projectId}?view=board`]]) {
    await ready(page, path);
    await expect(sidebar.getByRole("button")).toHaveCount(0);
    await page.mouse.move(800, 120);
    await expect(sidebar).toHaveAttribute("data-state", "closed");
    await page.waitForTimeout(350);
    expect(await panel.evaluate(element => element.getBoundingClientRect().width)).toBe(80);
    const logo = await sidebar.locator('a[href="/dashboard"]').first().boundingBox();
    await page.screenshot({ path: `tmp/sidebar-polish/after-${name}-closed.png` });
    const samplesPending = page.evaluate(async () => {
      const main = document.querySelector("#main-content");
      const icon = document.querySelector("[data-app-sidebar] nav svg");
      const panel = document.querySelector("[data-sidebar-panel]");
      if (!main || !icon || !panel) throw new Error("Missing shell");
      const samples: { mainX: number; mainWidth: number; scrollWidth: number; iconX: number; iconY: number; panelWidth: number }[] = [];
      const start = performance.now();
      await new Promise<void>(resolve => {
        function sample() {
          const mainRect = main!.getBoundingClientRect();
          const iconRect = icon!.getBoundingClientRect();
          samples.push({ mainX: mainRect.x, mainWidth: mainRect.width, scrollWidth: main!.scrollWidth, iconX: iconRect.x, iconY: iconRect.y, panelWidth: panel!.getBoundingClientRect().width });
          if (performance.now() - start < 500) requestAnimationFrame(sample); else resolve();
        }
        sample();
      });
      return samples;
    });
    await page.mouse.move(40, 160);
    const samples = await samplesPending;
    expect(new Set(samples.map(({panelWidth: _width, ...geometry}) => JSON.stringify(geometry))).size).toBe(1);
    expect(samples.some(sample => sample.panelWidth > 80 && sample.panelWidth < 288)).toBe(true);
    expect(await panel.evaluate(element => element.getBoundingClientRect().width)).toBe(288);
    expect(await sidebar.locator('a[href="/dashboard"]').first().boundingBox()).toEqual(logo);
    const header = await page.locator("[data-application-header]").boundingBox();
    const panelBox = await panel.boundingBox();
    expect(panelBox?.y).toBe((header?.y ?? 0) + (header?.height ?? 0));
    expect(await page.evaluate(() => document.elementFromPoint(120, 35)?.closest("header") !== null)).toBe(true);
    await expect(sidebar.locator('nav a[aria-current="page"]')).toHaveAttribute("href", name === "calendar" ? "/calendar" : "/projects");
    await page.mouse.move(200, 160, { steps: 8 });
    await expect(sidebar).toHaveAttribute("data-state", "open");
    await page.mouse.move(400, 160);
    await page.waitForTimeout(30);
    await page.mouse.move(200, 160);
    await page.waitForTimeout(100);
    await expect(sidebar).toHaveAttribute("data-state", "open");
    await page.screenshot({ path: `tmp/sidebar-polish/after-${name}-open.png` });
    await page.mouse.move(800, 160);
    await page.waitForTimeout(190);
    const closingWidth = await panel.evaluate(element => element.getBoundingClientRect().width);
    expect(closingWidth).toBeGreaterThan(80);
    expect(closingWidth).toBeLessThan(288);
    await page.mouse.move(40, 160);
    await expect.poll(() => panel.evaluate(element => element.getBoundingClientRect().width)).toBe(288);
    await page.mouse.move(120, 35);
    await expect(sidebar).toHaveAttribute("data-state", "closed");
  }

  await page.setViewportSize({ width: 1024, height: 560 });
  await page.mouse.move(40, 160);
  await page.waitForTimeout(350);
  await page.mouse.wheel(0, 1000);
  const nav = sidebar.locator("nav");
  await expect.poll(() => nav.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(sidebar.locator('nav a[href="/admin"]')).toBeInViewport();
  const positions = () => nav.evaluate(element => ({ height: element.clientHeight, scroll: element.scrollTop, icons: Array.from(element.querySelectorAll("svg")).map(icon => { const box = icon.getBoundingClientRect(); return {x: box.x, y: box.y}; }) }));
  const scrolled = await positions();
  await page.mouse.move(800, 120);
  await page.waitForTimeout(450);
  expect(await positions()).toEqual(scrolled);
  await page.mouse.move(40, 160);
  await page.waitForTimeout(350);
  expect(await positions()).toEqual(scrolled);
  await page.screenshot({ path: "tmp/sidebar-polish/after-short.png" });

  await page.mouse.move(800, 120);
  await page.keyboard.press("Tab");
  const calendar = sidebar.locator('nav a[href="/calendar"]');
  await calendar.focus();
  await expect(sidebar).toHaveAttribute("data-state", "open");
  expect(await calendar.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  await calendar.press("Enter");
  await expect(page).toHaveURL(/\/calendar$/);
  await page.locator("[data-header-profile]").focus();
  await expect(sidebar).toHaveAttribute("data-state", "closed");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await panel.evaluate(element => getComputedStyle(element).transitionProperty)).toBe("none");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar).toBeHidden();
  await page.locator('header button[aria-controls="mobile-application-navigation"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator('#mobile-application-navigation nav a[href="/projects"]').click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("dialog")).toBeHidden();
});
