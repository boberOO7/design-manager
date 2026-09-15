import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const admin = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const projectIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const eventIds = [randomUUID(), randomUUID()];
const dayOffId = randomUUID();
const accounts = ["admin", "employee"].map((role) => ({ role, id: "", email: `calendar-projects-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
function sqlId(value: string) { return `'${z.uuid().parse(value)}'`; }
function localSql(sql: string, actor = accounts[0].id) {
  if (actor) sql = `select set_config('request.jwt.claim.sub', ${sqlId(actor)}, false);\n${sql}`;
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8" }).trim();
}
async function login(page: Page, account = accounts[0]) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}
async function choose(page: Page, scope: Locator, label: string, value: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
  await expect(scope.getByRole("combobox", { name: label, exact: true })).toContainText(value);
}
function observeWorkspace(page: Page, path: string) {
  const requests: string[] = [];
  page.on("request", (request) => {
    // Production Link prefetches are distinct from navigation/action requests.
    if (new URL(request.url()).pathname === path && !request.headers()["next-router-prefetch"]) requests.push(request.headers()["next-action"] ? "action" : request.method());
  });
  return async (label: string, expected: string[]) => {
    await page.waitForTimeout(350);
    expect(requests, label).toEqual(expected);
    requests.length = 0;
  };
}
test.beforeAll(async () => {
  await admin.from("studios").insert({ id: studioId, name: "Calendar and Projects URL test" }).throwOnError();
  for (const account of accounts) {
    const user = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
    if (user.error) throw user.error;
    account.id = user.data.user.id;
    const role = account.role === "admin" ? "admin" : "employee";
    await admin.from("profiles").upsert({ id: account.id, email: account.email, full_name: `Calendar ${role}`, system_role: role, is_active: true }).throwOnError();
    await admin.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: role, is_active: true }).throwOnError();
  }
  for (const [i, id] of projectIds.entries()) {
    localSql(`insert into public.projects(id,studio_id,name,project_code,status,priority,total_area_m2,start_date,due_date,completed_at,created_by,country_code) values (${sqlId(id)},${sqlId(studioId)},'${["Alpha active", "Beta paused", "Gamma planned", "Delta completed", "фівфівфів"][i]}','PERF_${i}','${["active", "paused", "planned", "completed", "completed"][i]}','${i === 0 ? "high" : "normal"}',100,'2026-09-01','2026-09-${15+i}',${i >= 3 ? "'2026-09-14'" : "null"},${sqlId(accounts[0].id)},'UA');`);
  }
  for (const [i, id] of eventIds.entries()) localSql(`insert into public.calendar_events(id,studio_id,project_id,title,event_type,meeting_mode,starts_at,ends_at,created_by,organizer_id) values (${sqlId(id)},${sqlId(studioId)},${i === 0 ? sqlId(projectIds[0]) : "null"},'Routing event ${i}','meeting','offline','2026-09-15T09:00:00Z','2026-09-15T10:00:00Z',${sqlId(accounts[i].id)},${sqlId(accounts[i].id)});`, accounts[i].id);
  localSql(`insert into public.studio_days_off(id,studio_id,date,name,created_by) values (${sqlId(dayOffId)},${sqlId(studioId)},'2026-09-16','Routing day off',${sqlId(accounts[0].id)});`);

});
test.afterAll(async () => {
  localSql(`delete from public.calendar_events where studio_id=${sqlId(studioId)}; delete from public.studios where id=${sqlId(studioId)};`);
  for (const account of accounts) if (account.id) { const result = await admin.auth.admin.deleteUser(account.id); if (result.error) throw result.error; }
});

test("Calendar filters stay local and real refresh adopts the same-range snapshot", async ({ page }) => {
  const t = en.Calendar;
  await login(page);
  const check = observeWorkspace(page, "/calendar");
  await page.goto("/calendar?view=agenda&date=2026-09-14");
  await expect(page.getByRole("button", { name: /Routing event 0/ })).toBeVisible();
  await check("load", ["GET"]);
  const historyLength = await page.evaluate(() => history.length);
  await choose(page, page.locator("main"), t.filterPerson, "Calendar employee");
  await expect(page.getByRole("button", { name: /Routing event 0/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Routing event 1/ })).toBeVisible();
  await check("person", []);
  await choose(page, page.locator("main"), t.filterProject, "Alpha active");
  await expect(page.getByRole("button", { name: /Routing event 1/ })).toHaveCount(0);
  await check("project", []);
  await choose(page, page.locator("main"), t.filterPerson, t.allPeople);
  await page.getByRole("button", { name: t.filters, exact: true }).click();
  await page.getByRole("checkbox", { name: t.relevantToMe, exact: true }).click();
  await expect(page.getByRole("checkbox", { name: t.relevantToMe, exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: /Routing event 0/ })).toBeVisible();
  await check("mine", []);
  await page.getByRole("checkbox", { name: t.events, exact: true }).click();
  await expect(page.getByRole("checkbox", { name: t.events, exact: true })).not.toBeChecked();
  await expect(page.getByRole("button", { name: /Routing event 0/ })).toHaveCount(0);
  await check("source", []);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  const filteredUrl = page.url();
  await page.getByRole("button", { name: t.next, exact: true }).click();
  await expect(page).not.toHaveURL(filteredUrl);
  await check("range", ["GET"]);
  await page.goBack();
  await expect(page).toHaveURL(filteredUrl);
  await expect(page.getByRole("combobox", { name: t.filterProject })).toContainText("Alpha active");
  await check("Back", []);
  await page.goForward();
  await expect(page).not.toHaveURL(filteredUrl);
  await check("Forward", []);
  await page.goto(filteredUrl);
  await expect(page.getByRole("button", { name: /Routing event 0/ })).toHaveCount(0);
  await check("direct filtered", ["GET"]);
  await page.getByRole("button", { name: t.filters, exact: true }).click();
  await page.getByRole("button", { name: t.resetFilters, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Routing event 0/ })).toBeVisible();
  await check("reset", []);

  // A committed external edit is picked up by a legitimate Route Handler refresh.
  localSql(`update public.calendar_events set title='Fresh routing event' where id=${sqlId(eventIds[0])};`);
  await page.getByRole("button", { name: t.moreActions }).click();
  await page.getByRole("menuitem", { name: t.companyDaysOff }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: t.editDayOff.replace("{name}", "Routing day off") }).click();
  await drawer.getByLabel(t.dayOffName, { exact: true }).fill("Updated routing day off");
  await drawer.getByRole("button", { name: t.saveDayOff, exact: true }).click();
  await expect(drawer.getByText("Updated routing day off", { exact: true })).toBeVisible();
  await check("day off mutation refresh", ["GET"]);
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  await expect(page.getByRole("button", { name: /Fresh routing event/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Routing event 0/ })).toHaveCount(0);
  await page.goto(`/calendar?view=agenda&date=2026-09-14&event=${eventIds[0]}&refresh=notification-test`);
  await expect(page.getByRole("dialog", { name: "Fresh routing event", exact: true })).toBeVisible();
  await check("notification deep link", ["GET"]);
});

test("Projects filters and sort preserve URL history and project navigation", async ({ page }) => {
  const t = en.Projects;
  await login(page);
  const check = observeWorkspace(page, "/projects");
  await page.goto("/projects");
  await expect(page.getByRole("link", { name: /Alpha active/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Beta paused/ })).toHaveCount(0);
  await check("load", ["GET"]);
  const historyLength = await page.evaluate(() => history.length);
  await choose(page, page.locator("main"), t.priority, en.Priority.high);
  await check("priority", []);
  await choose(page, page.locator("main"), t.lifecycle, t.lifecycleCompleted);
  await expect(page.getByRole("link", { name: /Alpha active/ })).toHaveCount(0);
  await check("status", []);
  await choose(page, page.locator("main"), t.sortBy, t.deadline);
  await check("sort", []);
  await choose(page, page.locator("main"), t.priority, t.allPriorities);
  await expect(page.getByRole("link", { name: /Delta completed/ })).toBeVisible();
  await choose(page, page.locator("main"), t.health, t.healthCompleted);
  await check("combined", []);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  const filteredUrl = page.url();
  await page.getByRole("link", { name: /Delta completed/ }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectIds[3]}\\?lifecycle=completed&health=completed&sort=deadline$`));
  await page.reload();
  await expect(page.getByRole("link", { name: en.Workspace.backToProjects, exact: true })).toHaveAttribute("href", "/projects?lifecycle=completed&health=completed&sort=deadline");
  await check("open project", []);
  await page.goBack();
  await expect(page).toHaveURL(filteredUrl);
  await expect(page.getByRole("link", { name: /Delta completed/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: /Delta completed/ })).toBeVisible();
  await check("Back and reload", ["GET"]);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectIds[3]}\\?lifecycle=completed&health=completed&sort=deadline$`));
  await check("Forward", []);
  await page.goto(filteredUrl);
  await expect(page.getByRole("link", { name: /Delta completed/ })).toBeVisible();
  await check("direct filtered", ["GET"]);
  await page.getByRole("button", { name: t.resetFilters, exact: true }).click();
  await expect(page.getByRole("link", { name: /Alpha active/ })).toBeVisible();
  await check("reset", []);
  await choose(page, page.locator("main"), t.lifecycle, t.allLifecycles);
  await choose(page, page.locator("main"), t.sortBy, t.deadline);
  const links = page.locator('main a[href]').filter({ hasText: /Alpha active|Beta paused|Gamma planned/ });
  await expect(links.filter({ visible: true })).toHaveCount(3);
  await expect.poll(() => links.filter({ visible: true }).allTextContents()).toEqual([expect.stringContaining("Alpha active"), expect.stringContaining("Gamma planned"), expect.stringContaining("Beta paused")]);
  await check("paused ordering", []);
});

test("Projects hard reloads hydrate with deterministic lifecycle lists", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await login(page);

  for (const [lifecycle, label] of [
    ["active", en.Projects.lifecycleActive],
    ["planned", en.Projects.lifecyclePlanned],
    ["paused", en.Projects.lifecyclePaused],
    ["completed", en.Projects.lifecycleCompleted],
  ] as const) {
    await page.goto(`/projects?lifecycle=${lifecycle}`);
    await page.reload();
    await expect(page.getByRole("combobox", { name: en.Projects.lifecycle, exact: true })).toContainText(label);
  }

  const completedLinks = page.locator('main a[href^="/projects/"]').filter({ hasText: /Delta completed|фівфівфів/ }).filter({ visible: true });
  await expect(completedLinks).toHaveCount(2);
  expect(await completedLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual([
    `/projects/${projectIds[3]}?lifecycle=completed`,
    `/projects/${projectIds[4]}?lifecycle=completed`,
  ]);
  expect(runtimeErrors.filter((message) => /hydration|server rendered html|<script>|script tags/i.test(message))).toEqual([]);
});

test("Project completion date reflects the confirmed save immediately and after reload", async ({ page }) => {
  await login(page);
  await page.goto(`/projects/${projectIds[3]}?view=details`);
  const picker = page.getByRole("combobox", { name: en.ProjectWorkspace.completionDate, exact: true });
  const form = page.locator("form").filter({ has: picker });
  await expect(picker).toContainText("09/14/2026");

  await picker.click();
  await page.getByRole("gridcell", { name: "13", exact: true }).click();
  await form.getByRole("button", { name: en.ProjectForm.save, exact: true }).click();
  await expect.poll(() => localSql(`select completed_at from public.projects where id=${sqlId(projectIds[3])};`)).toBe("2026-09-13");
  await expect(picker).toContainText("09/13/2026");

  await picker.click();
  await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveText("13");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(picker).toContainText("09/13/2026");
});

test("Calendar retains a mutation completed while a same-range refresh is in flight", async ({ page }) => {
  const t = en.Calendar;
  const eventId = randomUUID();
  localSql(`insert into public.calendar_events(id,studio_id,title,event_type,meeting_mode,starts_at,ends_at,created_by,organizer_id) values (${sqlId(eventId)},${sqlId(studioId)},'Concurrent event','meeting','offline','2026-09-15T12:00:00Z','2026-09-15T13:00:00Z',${sqlId(accounts[0].id)},${sqlId(accounts[0].id)});`);
  await login(page);
  await page.goto("/calendar?view=agenda&date=2026-09-14");
  await expect(page.getByRole("button", { name: /Concurrent event/ })).toBeVisible();
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let captured = false;
  await page.route((url) => url.pathname === "/calendar" && url.searchParams.has("_rsc"), async (route) => {
    const response = await route.fetch();
    captured = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: t.moreActions }).click();
    await page.getByRole("menuitem", { name: t.companyDaysOff }).click();
    let drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: /^Edit / }).first().click();
    await drawer.getByLabel(t.dayOffName, { exact: true }).fill("Concurrent day off");
    await drawer.getByRole("button", { name: t.saveDayOff, exact: true }).click();
    await expect.poll(() => captured).toBe(true);
    await expect(drawer.getByRole("button", { name: t.addDayOff, exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: t.close, exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await page.getByRole("button", { name: /Concurrent event/ }).click();
    drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: t.editEvent, exact: true }).click();
    await drawer.getByLabel(t.titleLabel, { exact: true }).fill("Latest local event");
    await drawer.getByRole("button", { name: t.saveEvent, exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Latest local event", exact: true })).toBeVisible();
    release();
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog", { name: "Latest local event", exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: t.close, exact: true }).click();
    await expect(page.getByRole("button", { name: /Latest local event/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Concurrent event/ })).toHaveCount(0);
    await page.getByRole("button", { name: t.filters, exact: true }).click();
    await page.getByRole("checkbox", { name: t.events, exact: true }).click();
    await expect(page.getByRole("checkbox", { name: t.events, exact: true })).not.toBeChecked();
    await page.getByRole("checkbox", { name: t.events, exact: true }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /Latest local event/ })).toHaveCount(1);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
