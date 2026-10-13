import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";
import en from "../../messages/en.json";
import { calculateProjectSummary, type ProjectTaskForProgress } from "../../src/lib/project-progress";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID(), otherStudioId = randomUUID(), projectId = randomUUID(), taskId = randomUUID();
const actors = (["admin", "employee"] as const).map(role => ({ role, id: "", email: `projects-cache-${role}-${randomUUID()}@example.test`, password: `Cache-${randomUUID()}` }));
const listLink = 'aside a[href="/projects"]';
const ready = '[data-instaload-ready="projects"]';
const detailLink = `[data-instaload-arrival="${projectId}"] a`;
const fixtureTask = { id: taskId, stage: "stage_1", status: "in_progress", priority: "normal", due_date: null, assignee_id: null, completed_area_m2: null, progress_weight: 1, manual_progress_override: true, production_completion: 70, checklist_items: [] } satisfies ProjectTaskForProgress;
const updatedProgress = String(calculateProjectSummary([fixtureTask]).progress.progressPercent);
function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}

async function login(page: Page, actor = actors[0]) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: test.info().project.use.baseURL ?? "http://127.0.0.1:3100" }]);
  await signInLocalTestUser(page, actor);
  await page.waitForLoadState("networkidle");
}

async function navigate(page: Page, selector = listLink) {
  // Start/end in the browser, avoiding Playwright click/locator polling in the timing.
  return page.evaluate(({ selector, ready }) => new Promise<number>((resolve, reject) => {
    const link = document.querySelector<HTMLAnchorElement>(selector);
    if (!link) return reject(new Error(`Missing ${selector}`));
    const started = performance.now();
    link.click();
    function check() {
      const panel = document.querySelector<HTMLElement>(ready);
      const search = document.querySelector<HTMLInputElement>('input[type="search"]');
      if (location.pathname === "/projects" && panel?.getBoundingClientRect().height && search && !search.disabled) return resolve(performance.now() - started);
      if (performance.now() - started > 15000) return reject(new Error("Projects did not become usable"));
      requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  }), { selector, ready });
}

async function leave(page: Page) {
  await page.locator(`${detailLink}:visible`).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cached navigation pilot");
}

async function settled(page: Page) {
  await expect(page.locator(ready)).toBeVisible();
  await expect(page.locator('[data-projects-navigation="verified"]')).toBeVisible();
  // Wait for the refreshed scope snapshot instead of sampling while a refresh is in flight.
  await page.waitForLoadState("networkidle");
}

test.beforeAll(async () => {
  await service.from("studios").insert([{ id: studioId, name: "Projects cache pilot" }, { id: otherStudioId, name: "Projects cache other studio" }]).throwOnError();
  for (const actor of actors) {
    const created = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
    if (created.error) throw created.error;
    actor.id = created.data.user.id;
    await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: `Cache ${actor.role}`, system_role: actor.role, is_active: true }).throwOnError();
    await service.from("studio_members").insert({ studio_id: studioId, user_id: actor.id, system_role: actor.role, is_active: true }).throwOnError();
  }
  sql(`insert into projects(id,studio_id,name,status,total_area_m2,project_type,created_by) values (${id(projectId)},${id(studioId)},'Cached navigation pilot','active',100,'private',${id(actors[0].id)});
    insert into project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values ${actors.map(actor => `(${id(projectId)},${id(actor.id)},'designer',0,current_date)` ).join(",")};
    insert into tasks(id,project_id,title,stage,status,assignee_id,created_by,production_completion,manual_progress_override) values (${id(taskId)},${id(projectId)},'Cache task','stage_1','in_progress',${id(actors[0].id)},${id(actors[0].id)},10,true);`);
});

test.afterAll(async () => {
  sql(`begin; set local session_replication_role=replica;
    delete from private.finance_labor_membership_events where studio_id in (${id(studioId)},${id(otherStudioId)});
    delete from tasks where project_id=${id(projectId)}; delete from project_members where project_id=${id(projectId)};
    delete from project_activity where project_id=${id(projectId)}; delete from project_task_stage_columns where project_id=${id(projectId)};
    delete from task_status_periods where task_id=${id(taskId)};
    delete from projects where id=${id(projectId)}; delete from studio_members where studio_id in (${id(studioId)},${id(otherStudioId)});
    delete from studios where id in (${id(studioId)},${id(otherStudioId)}); commit;`);
  for (const actor of actors) if (actor.id) await service.auth.admin.deleteUser(actor.id);
});

test("release navigation uses fresh server data without experimental retention or duplicate checks", async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  const samples: Array<{ scenario: string; usableMs: number; freshnessMs: number | null; fresh: boolean; cacheReuse: boolean; prefetchRequests: string[]; requests: string[] }> = [];
  for (let iteration = 0; iteration < 5; iteration++) {
    sql(`update projects set status='active' where id=${id(projectId)}; update tasks set production_completion=10 where id=${id(taskId)};`);
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, reducedMotion: iteration === 4 ? "reduce" : "no-preference" });
    const page = await context.newPage();
    try {
      await login(page);
      const requests: string[] = [];
      page.on("request", request => {
        if (new URL(request.url()).pathname === "/projects") requests.push(request.headers()["next-action"] ? "access" : request.headers()["next-router-prefetch"] ? "prefetch" : "navigation/refresh");
      });
      for (const scenario of ["first", "return", "prefetch", "task mutation", "project mutation"]) {
        if (scenario !== "first") await leave(page);
        requests.length = 0;
        if (scenario === "prefetch") {
          // Explicit keyboard intent; let the native loading-boundary prefetch finish before navigation.
          await page.locator(listLink).focus();
          await page.waitForLoadState("networkidle");
        }
        if (scenario === "project mutation") {
          const response = await page.request.patch(`/api/projects/${projectId}/status`, { data: { status: "paused" } });
          expect(response.ok()).toBe(true);
        }
        if (scenario === "task mutation") {
          await page.request.patch(`/api/projects/${projectId}/status`, { data: { status: "active" } });
          const response = await page.request.patch(`/api/tasks/${taskId}/progress`, { data: { production_completion: 70 } });
          expect(response.ok()).toBe(true);
        }
        const prefetchRequests = [...requests];
        requests.length = 0;
        const started = Date.now();
        const usableMs = await navigate(page);
        if (scenario === "project mutation") await expect(page.locator(`${detailLink}:visible`)).toHaveCount(0);
        if (scenario === "task mutation") await expect(page.locator(`${ready} [role="progressbar"]`).first()).toHaveAttribute("aria-valuenow", updatedProgress);
        let fresh = true;
        if (scenario === "task mutation") fresh = await page.locator(`${ready} [role="progressbar"]`).first().getAttribute("aria-valuenow") === updatedProgress;
        if (scenario === "project mutation") fresh = await page.locator(`${detailLink}:visible`).count() === 0;
        const freshnessMs = fresh ? Date.now() - started : null;
        await settled(page);
        if (iteration === 4 && scenario !== "project mutation") {
          await expect(page.locator(ready)).toHaveAttribute("data-instaload-entrance", "ready");
          expect(await page.locator(`${ready} [data-instaload-arrival]`).first().evaluate(element => getComputedStyle(element).animationName)).toBe("none");
        }
        samples.push({ scenario, usableMs: Math.round(usableMs), freshnessMs, fresh, cacheReuse: requests.includes("access"), prefetchRequests, requests: [...requests] });
      }
    } finally { await context.close(); }
  }
  await testInfo.attach("release-navigation.json", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
  expect(samples.every(sample => sample.fresh)).toBe(true);
  expect(samples.every(sample => !sample.cacheReuse && sample.requests.length === 1 && sample.requests[0] === "navigation/refresh")).toBe(true);
  expect(samples.every(sample => sample.prefetchRequests.length === 0)).toBe(true);
  console.log(JSON.stringify(samples));
});

test("default history reuse fails closed across permission, studio and session changes", async ({ page }) => {
  sql(`update projects set status='active' where id=${id(projectId)};`);
  await login(page, actors[1]);
  await navigate(page); await settled(page); await leave(page);
  sql(`update project_members set is_active=false where project_id=${id(projectId)} and user_id=${id(actors[1].id)};`);
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let checking = false;
  await page.route("**/projects", async route => {
    if (!route.request().headers()["next-action"]) return route.continue();
    checking = true;
    await held;
    await route.continue();
  });
  await page.goBack();
  await expect.poll(() => checking).toBe(true);
  await expect(page.locator('[data-projects-navigation="checking"]')).toBeVisible();
  await expect(page.locator(`${detailLink}:visible`)).toHaveCount(0);
  release();
  await expect(page.locator('[data-projects-navigation="verified"]')).toBeVisible();
  await page.unroute("**/projects");
  await settled(page);
  sql(`update project_members set is_active=true where project_id=${id(projectId)} and user_id=${id(actors[1].id)};`);
  await page.reload(); await settled(page); await leave(page);
  sql(`update studio_members set is_active=false where user_id=${id(actors[1].id)} and studio_id=${id(studioId)};`);
  await service.from("studio_members").insert({ studio_id: otherStudioId, user_id: actors[1].id, system_role: "employee", is_active: true }).throwOnError();
  await page.goBack();
  await expect(page.locator(`${detailLink}:visible`)).toHaveCount(0);
  await settled(page);
  sql(`update studio_members set is_active=false where user_id=${id(actors[1].id)} and studio_id=${id(otherStudioId)};`);
  sql(`update studio_members set is_active=true where user_id=${id(actors[1].id)} and studio_id=${id(studioId)};`);
  sql(`update project_members set is_active=true where project_id=${id(projectId)} and user_id=${id(actors[1].id)};`);
  await page.reload(); await settled(page); await leave(page);
  await page.getByRole("button", { name: en.Account.signOut, exact: true }).click();
  await page.getByRole("dialog", { name: en.Account.signOutConfirmTitle }).getByRole("button", { name: en.Account.signOut, exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(`${detailLink}:visible`)).toHaveCount(0);
});

test("filtered returns survive metadata mutations and a role change with the same visible projects", async ({ page }) => {
  sql(`update projects set status='active' where id=${id(projectId)};`);
  await login(page);
  await page.goto("/projects?query=Cached&sort=deadline&direction=asc");
  await settled(page);
  await expect(page.getByRole("searchbox")).toHaveValue("Cached");
  await leave(page);
  await page.getByRole("button", { name: en.ProjectWorkspace.edit, exact: true }).click();
  const edit = page.getByRole("dialog", { name: en.Projects.editProject });
  await edit.locator('[name="project_name"]').fill("Cached navigation pilot updated");
  await edit.getByRole("button", { name: en.ProjectForm.save, exact: true }).click();
  await expect(edit).toHaveCount(0);
  const back = page.locator('a[href^="/projects?query=Cached"]');
  await back.click();
  await settled(page);
  await expect(page.locator(ready)).toContainText("Cached navigation pilot updated");
  await expect(page.getByRole("searchbox")).toHaveValue("Cached");
  await expect(page).toHaveURL(/sort=deadline/);
  await leave(page);
  try {
    sql(`update studio_members set system_role='employee' where studio_id=${id(studioId)} and user_id=${id(actors[0].id)};`);
    await page.goBack();
    await settled(page);
    await expect(page.locator(ready)).toContainText("Cached navigation pilot updated");
    await expect(page.getByRole("button", { name: en.Projects.newProject, exact: true })).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveValue("Cached");
  } finally {
    sql(`update studio_members set system_role='admin' where studio_id=${id(studioId)} and user_id=${id(actors[0].id)};`);
  }
});

test("cold Projects intent avoids unhelpful speculation and write-producing detail prefetch", async ({ browser }, testInfo) => {
  test.setTimeout(90000);
  sql(`update projects set status='active' where id=${id(projectId)};`);
  const samples: Array<{ usableMs: number; prefetchRequests: number; navigationRequests: number }> = [];
  for (let iteration = 0; iteration < 5; iteration++) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const page = await context.newPage();
    try {
      const requests: Array<{ path: string; prefetch: string | undefined }> = [];
      page.on("request", request => {
        const path = new URL(request.url()).pathname;
        if (path === "/projects" || path === `/projects/${projectId}`) requests.push({ path, prefetch: request.headers()["next-router-prefetch"] });
      });
      await login(page);
      expect(requests).toHaveLength(0);
      await page.locator(listLink).focus();
      await page.waitForLoadState("networkidle");
      expect(requests).toHaveLength(0);
      const prefetchRequests = requests.length;
      const usableMs = Math.round(await navigate(page));
      await settled(page);
      const before = requests.length;
      await page.locator(`${detailLink}:visible`).hover();
      await page.waitForLoadState("networkidle");
      expect(requests).toHaveLength(before);
      samples.push({ usableMs, prefetchRequests, navigationRequests: before - prefetchRequests });
    } finally { await context.close(); }
  }
  await testInfo.attach("cold-prefetch.json", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
  console.log(JSON.stringify({ coldPrefetchSamples: samples }));
});


test("My Tasks keeps its normal inbox, filters, drawer and review navigation without pilot requests", async ({ page }) => {
  const actor = actors[0];
  sql(`update projects set status='active', name='Cached navigation pilot' where id=${id(projectId)}; update tasks set status='in_progress', assignee_id=${id(actor.id)} where id=${id(taskId)};`);
  await login(page);
  const actions: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/my-tasks" && request.headers()["next-action"]) actions.push(request.url()); });
  await page.locator('aside a[href="/my-tasks"]').click();
  const search = page.getByRole("searchbox", { name: en.Tasks.inboxSearch });
  await expect(search).toBeVisible(); await search.fill("Cache task");
  await page.getByRole("button", { name: "Open task Cache task", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: en.Tasks.taskDetails, exact: true });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: en.Tasks.closeTaskDetails }).click(); await expect(drawer).toHaveCount(0);
  const views = page.getByRole("navigation", { name: en.Tasks.taskViews });
  await views.locator('a[href="/my-tasks?view=review"]').click();
  await expect(views.locator('a[aria-current="page"]')).toHaveAttribute("href", "/my-tasks?view=review");
  await views.locator('a[href="/my-tasks"]').click(); await expect(search).toBeVisible();
  await page.waitForLoadState("networkidle"); expect(actions).toEqual([]);
  await page.locator(listLink).click(); await settled(page);
});
