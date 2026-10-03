import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const config = z.object({
  EQUIPMENT_TEST_SUPABASE_URL: z.url(),
  EQUIPMENT_TEST_SERVICE_KEY: z.string(),
  EQUIPMENT_TEST_PUBLISHABLE_KEY: z.string(),
}).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(config.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Employee profile fixtures require local Supabase");

const service = createClient<Database>(config.EQUIPMENT_TEST_SUPABASE_URL, config.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const foreignStudioId = randomUUID();
const accounts = [
  { role: "admin", name: "Morgan Atelier" },
  { role: "employee", name: "Alexandra Willow van der Meer" },
  { role: "colleague", name: "Sam Colleague" },
  { role: "foreign", name: "Casey Outside Studio" },
  { role: "newcomer", name: "Taylor Newcomer" },
].map((account) => ({ ...account, id: "", email: `employee-profile-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
const employee = accounts[1];
const projects = { visible: randomUUID(), privateEmployee: randomUUID(), hidden: randomUUID(), excluded: randomUUID(), past: randomUUID() };
const noteMarkers = [
  "September review: Alexandra coordinated the material samples carefully, kept the client updated, and helped the team resolve a late drawing change.",
  "September review: Continue building confidence in presentation reviews. Her clear handoff notes have already made coordination easier for the whole studio.",
];

function runDatabaseSql(sql: string) {
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    stdio: ["pipe", "ignore", "pipe"],
  });
}

async function login(page: Page, accountIndex: number) {
  await page.addInitScript(() => localStorage.setItem("studioflow-theme", "dark"));
  const origin = new URL(String(test.info().project.use.baseURL ?? "http://localhost:3000")).origin;
  let authCookies: Array<{ name: string; value: string }> = [];
  const auth = createServerClient<Database>(config.EQUIPMENT_TEST_SUPABASE_URL, config.EQUIPMENT_TEST_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => authCookies,
      setAll: (cookiesToSet) => { authCookies = cookiesToSet.map(({ name, value }) => ({ name, value })); },
    },
  });
  const result = await auth.auth.signInWithPassword({ email: accounts[accountIndex].email, password: accounts[accountIndex].password });
  if (result.error) throw result.error;
  await page.context().addCookies([
    ...authCookies.map(({ name, value }) => ({ name, value, url: origin, sameSite: "Lax" as const })),
    { name: "studioflow-locale", value: "en", url: origin, sameSite: "Lax" },
  ]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
}

async function createFixtureAccount(account: typeof accounts[number], studio: string, role: "admin" | "employee") {
  const created = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
  if (created.error) throw created.error;
  account.id = created.data.user.id;
  await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: account.name, system_role: role, is_active: true, job_title: "Architect", country_code: "UA", city: "Kyiv", notification_popups_enabled: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studio, user_id: account.id, system_role: role, is_active: true, joined_at: "2024-03-15" }).throwOnError();
}

async function saveScreenshot(page: Page, name: string) {
  mkdirSync(".local/profile-second-pass/renders/after", { recursive: true });
  await page.screenshot({ path: `.local/profile-second-pass/renders/after/${name}.png`, fullPage: true, animations: "disabled" });
}

async function saveOverviewScreenshots(page: Page, name: string) {
  const directory = ".local/profile-second-pass/renders/after";
  mkdirSync(directory, { recursive: true });
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: `${directory}/${name}-top.png`, animations: "disabled" });
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = Math.max(0, (main.scrollHeight - main.clientHeight) / 2);
    window.scrollTo(0, Math.max(0, (document.documentElement.scrollHeight - window.innerHeight) / 2));
  });
  await page.screenshot({ path: `${directory}/${name}-middle.png`, animations: "disabled" });
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = main.scrollHeight;
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.screenshot({ path: `${directory}/${name}-bottom.png`, animations: "disabled" });
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  });
}

async function saveElementScreenshot(locator: ReturnType<Page["locator"]>, name: string) {
  mkdirSync(".local/profile-second-pass/renders/after", { recursive: true });
  await locator.screenshot({ path: `.local/profile-second-pass/renders/after/${name}.png`, animations: "disabled" });
}

async function expectHistoryTracksAligned(page: Page) {
  const tracks = page.locator("#profile-history-heading").locator("xpath=following-sibling::ul[1]/li/span[2]");
  await expect(tracks).toHaveCount(6);
  const widths = (await tracks.all()).map(async (track) => (await track.boundingBox())?.width ?? 0);
  const resolved = await Promise.all(widths);
  expect(Math.max(...resolved) - Math.min(...resolved)).toBeLessThanOrEqual(1);
}

async function expectNoteComposerSettled(page: Page) {
  const container = page.locator("#employee-note-composer");
  const form = container.locator("form");
  await expect(form.locator('[name="reviewMonth"]')).toBeVisible();
  await expect(page.getByRole("button", { name: en.EmployeeProfile.saveNote, exact: true })).toBeVisible();
  await expect.poll(async () => {
    const [containerBox, formBox] = await Promise.all([container.boundingBox(), form.boundingBox()]);
    return containerBox && formBox ? containerBox.height >= formBox.height : false;
  }).toBe(true);
  const [containerBox, formBox] = await Promise.all([container.boundingBox(), form.boundingBox()]);
  expect(containerBox?.height).toBeGreaterThanOrEqual(formBox?.height ?? Number.POSITIVE_INFINITY);
}

async function expectProfilePortrait(page: Page, expectedMinimumWidth: number) {
  const portrait = page.locator('section[aria-labelledby="employee-name"] > span[aria-hidden="true"]');
  await expect(portrait).toBeVisible();
  const box = await portrait.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(expectedMinimumWidth);
  expect(box?.height).toBeGreaterThanOrEqual(expectedMinimumWidth);
  const radius = await portrait.evaluate((element) => getComputedStyle(element).borderRadius);
  expect(Number.parseFloat(radius)).toBeGreaterThan(0);
  expect(Number.parseFloat(radius)).toBeLessThan((box?.width ?? 0) / 4);
}

async function expectNoHorizontalOverflow(page: Page) {
  const main = page.locator("main");
  await expect.poll(() => main.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

async function expectRecentCalendarVisible(page: Page) {
  const calendar = page.getByRole("region", { name: en.EmployeeProfile.heatmapCalendar, exact: true });
  const recent = calendar.locator('button[data-date]:not([data-kind="future"]):not([data-kind="before_joining"])').last();
  await expect.poll(async () => {
    const [area, cell] = await Promise.all([calendar.boundingBox(), recent.boundingBox()]);
    return Boolean(area && cell && cell.x >= area.x && cell.x + cell.width <= area.x + area.width);
  }).toBe(true);
}

async function expectPolishedProfileLayout(page: Page) {
  const calendar = page.getByRole("region", { name: en.EmployeeProfile.heatmapCalendar, exact: true });
  if (await calendar.count()) {
    const fits = await calendar.evaluate((element) => {
      const area = element.getBoundingClientRect();
      return element.scrollWidth <= element.clientWidth + 1
        && Array.from(element.querySelectorAll('button[data-date]')).every((cell) => {
          const box = cell.getBoundingClientRect();
          return box.left >= area.left - 1 && box.right <= area.right + 1;
        });
    });
    expect(fits).toBe(true);
    const activity = page.locator('section[aria-labelledby="profile-activity-heading"]');
    for (const selector of ["dt", "dd"]) {
      const positions = await activity.locator(`dl ${selector}`).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
      expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1);
    }
  }
  const projects = page.locator('section[aria-labelledby="profile-projects-heading"]');
  const journey = page.locator('section[aria-labelledby="profile-milestones-heading"]');
  if (await journey.count()) {
    const [projectHeading, journeyHeading, projectCard, journeyCard] = await Promise.all([
      projects.getByRole("heading", { level: 2 }).boundingBox(), journey.getByRole("heading", { level: 2 }).boundingBox(),
      projects.locator(":scope > ul, :scope > div").last().boundingBox(), journey.locator(":scope > div").boundingBox(),
    ]);
    if (!projectHeading || !journeyHeading || !projectCard || !journeyCard) throw new Error("Profile sections must have rendered geometry");
    expect(Math.abs((projectCard.y - projectHeading.y - projectHeading.height) - (journeyCard.y - journeyHeading.y - journeyHeading.height))).toBeLessThanOrEqual(1);
    if (Math.abs(projectHeading.x - journeyHeading.x) > 1) {
      expect(Math.abs(projectHeading.y - journeyHeading.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(projectCard.y - journeyCard.y)).toBeLessThanOrEqual(1);
    }
  }
}

test.beforeAll(async () => {
  await service.from("studios").insert([{ id: studioId, name: "Employee profile browser" }, { id: foreignStudioId, name: "Separate profile studio" }]).throwOnError();
  await createFixtureAccount(accounts[0], studioId, "admin");
  await createFixtureAccount(employee, studioId, "employee");
  await createFixtureAccount(accounts[2], studioId, "employee");
  await createFixtureAccount(accounts[3], foreignStudioId, "employee");
  await createFixtureAccount(accounts[4], studioId, "employee");

  await service.from("studio_members").update({ joined_at: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10) }).eq("studio_id", studioId).eq("user_id", accounts[4].id).throwOnError();

  const taskIds = { credited: randomUUID(), zeroArea: randomUUID() };
  const voidedTask = randomUUID();
  const workingTask = randomUUID();
  runDatabaseSql(`
    insert into public.projects(id,studio_id,created_by,name,project_type,country_code,start_date,total_area_m2,status,include_in_productivity) values
      ('${projects.visible}','${studioId}','${accounts[0].id}','Visible Studio Library','private','UA','2026-01-01',120,'active',true),
      ('${projects.privateEmployee}','${studioId}','${accounts[0].id}','Private Employee Project','private','UA','2026-01-15',90,'paused',true),
      ('${projects.hidden}','${studioId}','${accounts[0].id}','Private Unassigned Project','private','UA','2026-02-01',80,'active',true),
      ('${projects.excluded}','${studioId}','${accounts[0].id}','Excluded Productivity Project','private','UA','2026-03-01',300,'active',false);
    insert into public.projects(id,studio_id,created_by,name,project_type,country_code,start_date,total_area_m2,status,completed_at)
      values('${projects.past}','${studioId}','${accounts[0].id}','Completed Atelier Archive','private','UA','2024-04-01',75,'completed','2025-02-01');
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at,is_active) values
      ('${projects.visible}','${employee.id}','other',0,'2026-01-01',true),
      ('${projects.visible}','${employee.id}','other',0,'2025-06-01',false),
      ('${projects.visible}','${accounts[2].id}','other',0,'2026-01-01',true),
      ('${projects.privateEmployee}','${employee.id}','other',0,'2026-01-15',true),
      ('${projects.past}','${employee.id}','other',0,'2024-04-01',false);
    insert into public.tasks(id,project_id,title,stage,status,assignee_id,created_by,completed_area_m2,productivity_area_m2,completed_at) values
      ('${taskIds.credited}','${projects.visible}','Stage 2 credited task','stage_2','completed','${employee.id}','${accounts[0].id}',17.5,17.5,'2026-09-12T12:00:00Z'),
      ('${taskIds.zeroArea}','${projects.visible}','Stage 2 zero-area task','stage_2','completed','${employee.id}','${accounts[0].id}',null,0,'2026-09-13T12:00:00Z'),
      ('${voidedTask}','${projects.visible}','Voided Stage 2 task','stage_2','completed','${employee.id}','${accounts[0].id}',1,1,'2026-09-20T12:00:00Z'),
      ('${workingTask}','${projects.visible}','Current library drawings','stage_2','in_progress','${employee.id}','${accounts[0].id}',null,null,null);
    insert into public.productivity_attributions(studio_id,project_id,task_id,contributor_id,source_type,task_stage,credited_area_m2,contributor_name,contributor_job_title,completed_at,voided_at) values
      ('${studioId}','${projects.visible}','${taskIds.credited}','${employee.id}','task','stage_2',17.5,'${employee.name}','Architect','2026-09-12T12:00:00Z',null),
      ('${studioId}','${projects.visible}','${taskIds.zeroArea}','${employee.id}','task','stage_2',0,'${employee.name}','Architect','2026-09-13T12:00:00Z',null),
      ('${studioId}','${projects.hidden}',null,'${employee.id}','project_fallback',null,12,'${employee.name}','Architect','2026-08-12T12:00:00Z',null),
      ('${studioId}','${projects.excluded}','${randomUUID()}','${employee.id}','task','stage_2',300,'${employee.name}','Architect','2026-09-18T12:00:00Z',null),
      ('${studioId}','${projects.visible}','${voidedTask}','${employee.id}','task','stage_2',900,'${employee.name}','Architect','2026-09-20T12:00:00Z','2026-09-21T12:00:00Z');
    begin;
    set local session_replication_role=replica;
    update public.studio_members set vacation_opening_days=20,vacation_opening_date=current_date-7 where studio_id='${studioId}' and user_id='${employee.id}';
    insert into private.studio_vacation_policies(studio_id,effective_at,annual_days,carry_rule,carry_cap_days) values('${studioId}',clock_timestamp()-interval '1 year',0,'none',null);
    insert into public.time_off_requests(id,studio_id,user_id,request_type,start_date,end_date,reviewed_by,reviewed_at,status) values
      ('${randomUUID()}','${studioId}','${employee.id}','day_off',current_date-14,current_date-14,'${accounts[0].id}',clock_timestamp(),'approved'),
      ('${randomUUID()}','${studioId}','${employee.id}','vacation',current_date-2,current_date-1,'${accounts[0].id}',clock_timestamp(),'approved');
    insert into public.calendar_events(id,studio_id,title,event_type,starts_at,ends_at,all_day,created_by,organizer_id,compensates_time_off_request_id)
      select '${randomUUID()}','${studioId}','Scheduled makeup','work_makeup',clock_timestamp()+interval '2 days',clock_timestamp()+interval '2 days 3 hours',false,'${employee.id}','${employee.id}',id
      from public.time_off_requests where studio_id='${studioId}' and user_id='${employee.id}' and request_type='day_off';
    commit;
  `);
});

test.afterAll(async () => {
  const safeStudioId = z.uuid().parse(studioId);
  const safeForeignStudioId = z.uuid().parse(foreignStudioId);
  runDatabaseSql(`
    delete from public.employee_profile_notes where studio_id='${safeStudioId}';
    delete from public.calendar_events where studio_id in ('${safeStudioId}','${safeForeignStudioId}');
    delete from public.time_off_requests where studio_id in ('${safeStudioId}','${safeForeignStudioId}');
    delete from public.tasks where project_id in (select id from public.projects where studio_id in ('${safeStudioId}','${safeForeignStudioId}'));
    delete from public.project_members where project_id in (select id from public.projects where studio_id in ('${safeStudioId}','${safeForeignStudioId}'));
    delete from public.project_activity where studio_id in ('${safeStudioId}','${safeForeignStudioId}');
    delete from public.projects where studio_id in ('${safeStudioId}','${safeForeignStudioId}');
    delete from public.project_activity where studio_id in ('${safeStudioId}','${safeForeignStudioId}');
    delete from public.studios where id in ('${safeStudioId}','${safeForeignStudioId}');
  `);
  for (const account of accounts) if (account.id) await service.auth.admin.deleteUser(account.id);
});

test("final focused profile polish: long titles, compact projects and journey semantics", async ({ page }) => {
  const longTaskTitle = "Coordinate the complete library drawing package and material specifications for the final client presentation";
  const longProjectTitle = "Riverside cultural centre — architecture, interior design and public library refurbishment";
  const additionalProjects = [
    { id: randomUUID(), name: longProjectTitle, status: "active", completedAt: null },
    { id: randomUUID(), name: "Courtyard residence", status: "paused", completedAt: null },
    { id: randomUUID(), name: "Completed garden pavilion", status: "completed", completedAt: "2026-08-10" },
  ] as const;
  runDatabaseSql(`
    insert into public.projects(id,studio_id,created_by,name,project_type,country_code,start_date,total_area_m2,status,completed_at) values
      ${additionalProjects.map((project) => `('${project.id}','${studioId}','${accounts[0].id}','${project.name.replaceAll("'", "''")}','private','UA','2024-03-20',60,'${project.status}',${project.completedAt ? `'${project.completedAt}'` : "null"})`).join(",")};
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at,is_active) values
      ${additionalProjects.map((project, index) => `('${project.id}','${employee.id}','other',0,'${index === 0 ? "2024-03-20" : "2026-04-01"}',true)`).join(",")};
    insert into public.tasks(id,project_id,title,stage,status,assignee_id,created_by) values
      ('${randomUUID()}','${additionalProjects[0].id}','${longTaskTitle}','stage_2','in_progress','${employee.id}','${accounts[0].id}');
  `);

  await login(page, 0);
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://localhost:3000", sameSite: "Lax" }]);
  await page.goto(`/team/${employee.id}`);
  await expect(page.getByRole("heading", { name: employee.name })).toBeVisible();
  const directory = ".local/profile-final-polish/after";
  mkdirSync(directory, { recursive: true });
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    const current = page.locator('section[aria-labelledby="profile-current-heading"]');
    const portfolio = page.locator('section[aria-labelledby="profile-projects-heading"]');
    await expect(current.getByRole("listitem")).toHaveCount(2);
    await expect(portfolio.getByRole("listitem")).toHaveCount(6);
    const taskSizes = await current.getByRole("link").evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    expect(Math.abs(taskSizes[0].height - taskSizes[1].height)).toBeLessThanOrEqual(1);
    expect(Math.abs(taskSizes[0].width - taskSizes[1].width)).toBeLessThanOrEqual(1);
    expect(taskSizes[0].height).toBeLessThanOrEqual(60);
    const projectHeights = await portfolio.getByRole("listitem").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(Math.max(...projectHeights) - Math.min(...projectHeights)).toBeLessThanOrEqual(1);
    expect(Math.max(...projectHeights)).toBeLessThan(100);
    const bottomBorders = await portfolio.getByRole("listitem").evaluateAll((items) => items.slice(-2).map((item) => getComputedStyle(item).borderBottomWidth));
    expect(bottomBorders).toEqual(["0px", "0px"]);
    await expectPolishedProfileLayout(page);
    const currentProjectIds = (await portfolio.getByRole("link").all()).slice(0, 2);
    expect(await Promise.all(currentProjectIds.map((item) => item.getAttribute("href")))).toEqual(expect.arrayContaining([
      `/projects/${projects.visible}`, `/projects/${additionalProjects[0].id}`,
    ]));
    const journey = page.locator('section[aria-labelledby="profile-milestones-heading"]');
    const firstParticipation = journey.getByRole("heading", { name: uk.EmployeeProfile.firstProject, exact: true }).locator("../..");
    await expect(firstParticipation.getByRole("link")).toHaveText(longProjectTitle);
    await expect(firstParticipation).toContainText("20 бер. 2024");
    const firstCompletion = journey.getByRole("heading", { name: uk.EmployeeProfile.firstCompletedProject, exact: true }).locator("../..");
    await expect(firstCompletion.getByRole("link")).toHaveText("Completed Atelier Archive");
    await expect(firstCompletion).toContainText("1 лют. 2025");
    await expect(journey.getByRole("heading", { name: uk.EmployeeProfile.joinedStudio, exact: true })).toBeVisible();
    const milestoneDates = await journey.locator("ol > li > div > p:first-child").evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      return { left: box.left, top: box.top };
    }));
    if (Math.abs(milestoneDates[0].left - milestoneDates[1].left) > 1) {
      expect(Math.max(...milestoneDates.map((item) => item.top)) - Math.min(...milestoneDates.map((item) => item.top))).toBeLessThanOrEqual(1);
    }
    await current.screenshot({ path: `${directory}/current-${width}.png`, animations: "disabled" });
    await page.locator('section[aria-labelledby="profile-activity-heading"]').screenshot({ path: `${directory}/activity-${width}.png`, animations: "disabled" });
    await portfolio.locator("..").screenshot({ path: `${directory}/projects-journey-${width}.png`, animations: "disabled" });
    for (const [preview, fullTitle, label] of [
      [current.getByRole("link").filter({ hasText: longTaskTitle }), longTaskTitle, "task"],
      [portfolio.getByRole("link").filter({ hasText: longProjectTitle }), longProjectTitle, "project"],
    ] as const) {
      expect(await preview.locator("[data-preview-title]").evaluate((item) => item.scrollWidth > item.clientWidth)).toBe(true);
      await preview.hover();
      await expect(page.getByRole("tooltip")).toHaveText(fullTitle);
      await expect(page.getByRole("tooltip")).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: `${directory}/${label}-tooltip-${width}.png`, animations: "disabled" });
      await page.mouse.move(width - 1, 80);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await preview.focus();
      await expect(page.getByRole("tooltip")).toHaveText(fullTitle);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await preview.evaluate((element) => { if (element instanceof HTMLElement) element.blur(); });
      await page.mouse.move(width - 1, 80);
    }
    const range = page.locator('section[aria-labelledby="profile-activity-heading"] p').filter({ has: page.locator("svg") });
    await expect(range).toHaveCSS("font-weight", "500");
    await expect(range).toHaveCSS("border-width", "0px");
    await expectNoHorizontalOverflow(page);
  }
  await page.context().clearCookies();
  await login(page, 1);
  await page.goto(`/team/${employee.id}`);
  await expect(page.locator('section[aria-labelledby="profile-activity-heading"]')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="profile-contribution-heading"], section[aria-labelledby="profile-employment-heading"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: en.EmployeeProfile.internalNotes, exact: true })).toHaveCount(0);
  await page.context().clearCookies();
  await login(page, 2);
  await page.goto(`/team/${employee.id}`);
  await expect(page.locator('section[aria-labelledby="profile-activity-heading"], section[aria-labelledby="profile-contribution-heading"], section[aria-labelledby="profile-employment-heading"]')).toHaveCount(0);
  await expect(page.getByText(longTaskTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByText(longProjectTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: en.EmployeeProfile.internalNotes, exact: true })).toHaveCount(0);
  // Keep the shared fixture unchanged for the existing profile test.
  runDatabaseSql(`
    delete from public.tasks where project_id in (${additionalProjects.map((project) => `'${project.id}'`).join(",")});
    delete from public.project_members where project_id in (${additionalProjects.map((project) => `'${project.id}'`).join(",")});
    delete from public.projects where id in (${additionalProjects.map((project) => `'${project.id}'`).join(",")});
  `);
});

test("profile entry points, private work details, notes RLS, settings and responsive profile views", async ({ page, browser }) => {
  await login(page, 0);
  const headerIdentity = page.getByRole("link", { name: en.Account.viewProfile, exact: true });
  await headerIdentity.click();
  await expect(page).toHaveURL(new RegExp(`/team/${accounts[0].id}$`));
  await page.goto("/team");
  await expect(page.getByRole("link", { name: employee.name, exact: true })).toHaveAttribute("href", `/team/${employee.id}`);

  await page.goto(`/team/${employee.id}`);
  await expect(page.getByRole("heading", { name: employee.name })).toBeVisible();
  await expectProfilePortrait(page, 150);
  await expect(page.getByRole("heading", { name: en.EmployeeProfile.contribution, exact: true })).toBeVisible();
  const completedTasksMetric = page.locator("dt").filter({ hasText: new RegExp(`^${en.EmployeeProfile.completedTasks}$`) }).locator("xpath=following-sibling::dd[1]");
  const creditedAreaMetric = page.locator("dt").filter({ hasText: new RegExp(`^${en.EmployeeProfile.creditedArea}$`) }).locator("xpath=following-sibling::dd[1]");
  const projectsSection = page.locator('section[aria-labelledby="profile-projects-heading"]');
  await expect(projectsSection.getByRole("listitem")).toHaveCount(3);
  await expect(completedTasksMetric).toHaveText("3");
  await expect(creditedAreaMetric).toHaveText("29.5 m²");
  await expect(projectsSection.getByText("Visible Studio Library", { exact: true })).toBeVisible();
  await expect(projectsSection.getByText("Private Employee Project", { exact: true })).toBeVisible();
  await expect(projectsSection.getByText("Private Unassigned Project", { exact: true })).toHaveCount(0);
  await expect(projectsSection.getByText("Excluded Productivity Project", { exact: true })).toHaveCount(0);
  await expect(projectsSection.getByText("Completed Atelier Archive", { exact: true })).toBeVisible();
  await expect(projectsSection.getByRole("listitem").first()).toContainText("Visible Studio Library");
  await expect(page.getByText(en.EmployeeProfile.firstCompletedProject, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: en.EmployeeProfile.internalNotes, exact: true })).toBeVisible();
  await expect(page.getByText(noteMarkers[0], { exact: true })).toHaveCount(0);
  const employment = page.locator('section[aria-labelledby="profile-employment-heading"]');
  await expect(employment.locator("dt").filter({ hasText: en.EmployeeProfile.absences }).locator("xpath=following-sibling::dd[1]")).toHaveText("2 requests");
  await expect(employment.locator("dt").filter({ hasText: en.EmployeeProfile.workMakeup }).locator("xpath=following-sibling::dd[1]")).toHaveText("3 h");
  await expect(employment.locator("dt").filter({ hasText: en.EmployeeProfile.availableVacation }).locator("xpath=following-sibling::dd[1]")).toHaveText("18 days");
  await expect(employment.getByRole("heading", { name: en.EmployeeProfile.vacationPeriods })).toBeVisible();
  await expectHistoryTracksAligned(page);
  const adminCalendar = page.locator('section[aria-labelledby="profile-activity-heading"]');
  await expect(adminCalendar.locator('button[data-date]')).toHaveCount(364);
  await adminCalendar.locator('button[data-date="2026-09-12"]').hover();
  await expect(page.getByRole("tooltip")).toContainText("Sep 12, 2026");
  await expect(page.getByRole("tooltip")).toContainText("1 completed task");
  await adminCalendar.locator('button[data-date="2026-09-12"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(adminCalendar.locator('button[data-date="2026-09-19"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const approvedDay = adminCalendar.locator('button[data-kind="time_off"]').first();
  await approvedDay.hover();
  await expect(page.getByRole("tooltip")).toContainText(en.EmployeeProfile.heatmapTimeOff);
  await page.mouse.move(0, 0);

  await page.getByRole("link", { name: en.EmployeeProfile.internalNotes, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/team/${employee.id}\\?view=notes$`));
  await saveScreenshot(page, "admin-employee-notes-desktop");

  for (const [index, note] of noteMarkers.entries()) {
    await page.getByRole("button", { name: en.EmployeeProfile.addNote }).click();
    await page.locator('[name="reviewMonth"]').fill("2026-09");
    await page.locator('[name="note"]').fill(note);
    if (index === 0) {
      await expectNoteComposerSettled(page);
      await saveElementScreenshot(page.locator("#employee-note-composer"), "admin-note-composer-desktop");
    }
    await page.getByRole("button", { name: en.EmployeeProfile.saveNote }).click();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "September 2026" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: noteMarkers[0] })).toHaveCount(1);
  await expect(page.locator("article").filter({ hasText: noteMarkers[1] })).toHaveCount(1);

  await page.getByRole("link", { name: en.EmployeeProfile.overview, exact: true }).click();
  await expect(page.getByText(noteMarkers[0], { exact: true })).toHaveCount(0);

  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["notebook", { width: 1024, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(viewport);
    await expectProfilePortrait(page, label === "mobile" ? 110 : 150);
    await expectHistoryTracksAligned(page);
    await expectNoHorizontalOverflow(page);
    await expectPolishedProfileLayout(page);
    await saveOverviewScreenshots(page, `admin-employee-${label}`);
  }
  await page.getByRole("link", { name: en.EmployeeProfile.internalNotes, exact: true }).click();
  await page.getByRole("button", { name: en.EmployeeProfile.addNote }).click();
  await page.locator('[name="reviewMonth"]').fill("2026-10");
  await page.locator('[name="note"]').fill("Draft observation: continue sharing clear project handoffs and build confidence presenting design options to clients.");
  await expectNoteComposerSettled(page);
  await saveElementScreenshot(page.locator("#employee-note-composer"), "admin-note-composer-mobile");
  await page.getByRole("button", { name: en.EmployeeProfile.cancel }).click();

  const employeePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(employeePage, 1);
  await employeePage.getByRole("link", { name: en.Account.viewProfile, exact: true }).click();
  await expect(employeePage).toHaveURL(new RegExp(`/team/${employee.id}$`));
  await expectProfilePortrait(employeePage, 150);
  await expect(employeePage.getByRole("heading", { name: en.EmployeeProfile.personalActivity, exact: true })).toBeVisible();
  await expect(employeePage.locator('section[aria-labelledby="profile-contribution-heading"]')).toHaveCount(0);
  await expect(employeePage.locator("#profile-history-heading")).toHaveCount(0);
  await expect(employeePage.locator("dt").filter({ hasText: en.EmployeeProfile.creditedArea })).toHaveCount(0);
  await expect(employeePage.getByText("1 task in progress", { exact: true })).toBeVisible();
  await expect(employeePage.getByText("Completed Atelier Archive", { exact: true })).toHaveCount(0);
  await expect(employeePage.locator('section[aria-labelledby="profile-projects-heading"]').getByRole("listitem")).toHaveCount(2);
  await expect(employeePage.locator('section[aria-labelledby="profile-projects-heading"]').getByRole("listitem").first()).toContainText("Visible Studio Library");
  const selfHtml = await employeePage.content();
  expect(selfHtml).not.toMatch(/29\.5|areaM2|credited_area_m2/);
  expect(selfHtml).not.toContain(noteMarkers[0]);
  expect(selfHtml).not.toContain(noteMarkers[1]);
  await expect(employeePage.getByRole("link", { name: en.EmployeeProfile.internalNotes, exact: true })).toHaveCount(0);
  await expect(employeePage.locator('section[aria-labelledby="profile-employment-heading"]')).toHaveCount(0);
  const selfCalendar = employeePage.locator('section[aria-labelledby="profile-activity-heading"]');
  await expect(selfCalendar.locator('button[data-date]')).toHaveCount(364);
  await selfCalendar.locator('button[data-date="2026-09-13"]').hover();
  await expect(employeePage.getByRole("tooltip")).toContainText("1 completed task");
  await saveScreenshot(employeePage, "employee-heatmap-tooltip-desktop");
  await employeePage.mouse.move(0, 0);
  await expect(employeePage.locator('#profile-private-heading')).toHaveCount(0);
  await expect(employeePage.getByText("Current library drawings", { exact: true })).toBeVisible();
  await employeePage.goto("/leaderboard");
  await expect(employeePage).toHaveURL(/\/dashboard$/);
  await employeePage.goto(`/team/${employee.id}`);
  const settings = employeePage.getByRole("button", { name: en.Account.profileSettings, exact: true });
  await settings.click();
  const editor = employeePage.getByRole("dialog", { name: en.Account.profileEditor, exact: true });
  const city = editor.locator('[name="profile-city"]');
  await employeePage.route("**/api/cities?*", (route) => route.fulfill({ json: { results: [{ id: 702550, name: "Lviv", displayName: "Lviv", region: "Lviv", countryName: "Ukraine" }] } }));
  await city.fill("Lvi");
  await employeePage.getByRole("option").click();
  const notifications = editor.getByRole("checkbox", { name: en.Account.notificationPopups, exact: true });
  await notifications.setChecked(false);
  await editor.getByRole("button", { name: en.Account.save, exact: true }).click();
  await expect(editor).toHaveCount(0);
  await settings.click();
  await expect(city).toHaveValue("Lviv");
  await expect(notifications).not.toBeChecked();
  await employeePage.setViewportSize({ width: 390, height: 844 });
  await expectProfilePortrait(employeePage, 110);
  await expectNoHorizontalOverflow(employeePage);
  const editorBox = await editor.boundingBox();
  expect(editorBox?.width).toBeLessThanOrEqual(390);
  await saveScreenshot(employeePage, "employee-settings-mobile");
  await employeePage.keyboard.press("Escape");
  await employeePage.setViewportSize({ width: 1440, height: 1000 });
  await expectProfilePortrait(employeePage, 150);
  await expectNoHorizontalOverflow(employeePage);
  await expectPolishedProfileLayout(employeePage);
  await saveScreenshot(employeePage, "employee-own-profile-desktop");
  for (const [label, viewport] of [["notebook", { width: 1024, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
    await employeePage.setViewportSize(viewport);
    await expectProfilePortrait(employeePage, label === "mobile" ? 110 : 150);
    await expectNoHorizontalOverflow(employeePage);
    await expectRecentCalendarVisible(employeePage);
    await expectPolishedProfileLayout(employeePage);
    await saveScreenshot(employeePage, `employee-own-profile-${label}`);
    await saveOverviewScreenshots(employeePage, `employee-own-profile-${label}`);
  }

  const colleaguePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const colleagueRequests: string[] = [];
  colleaguePage.on("request", (request) => colleagueRequests.push(request.url()));
  await login(colleaguePage, 2);
  await colleaguePage.goto(`/team/${employee.id}`);
  await expect(colleaguePage.getByRole("heading", { name: employee.name })).toBeVisible();
  await expectProfilePortrait(colleaguePage, 150);
  await expect(colleaguePage.getByRole("heading", { name: en.EmployeeProfile.contribution, exact: true })).toHaveCount(0);
  await expect(colleaguePage.getByRole("heading", { name: en.EmployeeProfile.internalNotes })).toHaveCount(0);
  await expect(colleaguePage.getByRole("link", { name: en.EmployeeProfile.internalNotes, exact: true })).toHaveCount(0);
  await expect(colleaguePage.locator('section[aria-labelledby="profile-employment-heading"]')).toHaveCount(0);
  const colleagueProjects = colleaguePage.locator('section[aria-labelledby="profile-projects-heading"]');
  await expect(colleagueProjects.getByRole("listitem")).toHaveCount(1);
  await expect(colleagueProjects.getByText("Visible Studio Library", { exact: true })).toBeVisible();
  await expect(colleagueProjects.getByText("Private Employee Project", { exact: true })).toHaveCount(0);
  await colleaguePage.goto(`/team/${employee.id}?view=notes`);
  await expect(colleaguePage).toHaveURL(new RegExp(`/team/${employee.id}\\?view=notes$`));
  await expect(colleaguePage.getByRole("heading", { name: en.EmployeeProfile.sharedProjects, exact: true })).toBeVisible();
  const colleagueHtml = await colleaguePage.content();
  expect(colleagueHtml).not.toContain(noteMarkers[0]);
  expect(colleagueHtml).not.toContain(noteMarkers[1]);
  expect(colleagueHtml).not.toContain("29.5");
  expect(colleagueHtml).not.toContain("2 requests");
  expect(colleagueHtml).not.toContain("3 h");
  expect(colleagueHtml).not.toContain("18 days");
  await expect(colleaguePage.locator('section[aria-labelledby="profile-contribution-heading"]')).toHaveCount(0);
  await expect(colleaguePage.locator('section[aria-labelledby="profile-activity-heading"]')).toHaveCount(0);
  await expect(colleaguePage.getByText("Current library drawings", { exact: true })).toHaveCount(0);
  await expect(colleaguePage.locator("dt").filter({ hasText: en.EmployeeProfile.creditedArea })).toHaveCount(0);
  expect(colleagueRequests.some((url) => /employee_profile_notes|productivity_attributions|time_off_requests|calendar_events|get_vacation_balance/.test(url))).toBe(false);
  await saveScreenshot(colleaguePage, "colleague-basic-profile-desktop");
  for (const [label, viewport] of [["notebook", { width: 1024, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
    await colleaguePage.setViewportSize(viewport);
    await expectProfilePortrait(colleaguePage, label === "mobile" ? 110 : 150);
    await expectNoHorizontalOverflow(colleaguePage);
    await saveScreenshot(colleaguePage, `colleague-basic-profile-${label}`);
    await saveOverviewScreenshots(colleaguePage, `colleague-basic-profile-${label}`);
  }

  const directCaller = createClient<Database>(config.EQUIPMENT_TEST_SUPABASE_URL, config.EQUIPMENT_TEST_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await directCaller.auth.signInWithPassword({ email: accounts[2].email, password: accounts[2].password });
  expect(signedIn.error).toBeNull();
  const read = await directCaller.from("employee_profile_notes").select("id,note").eq("employee_id", employee.id);
  expect(read.error).toBeNull();
  expect(read.data).toEqual([]);
  const employmentRead = await directCaller.from("time_off_requests").select("id").eq("user_id", employee.id);
  expect(employmentRead.error).toBeNull();
  expect(employmentRead.data).toEqual([]);
  const privateBalance = await directCaller.rpc("get_vacation_balance", {
    p_studio_id: studioId,
    p_user_id: employee.id,
    p_as_of: new Date().toISOString().slice(0, 10),
  });
  expect(privateBalance.error).not.toBeNull();
  const write = await directCaller.from("employee_profile_notes").insert({ studio_id: studioId, employee_id: employee.id, review_month: "2026-09-01", note: "Unauthorized colleague attempt" });
  expect(write.error).not.toBeNull();
  await directCaller.auth.signInWithPassword({ email: employee.email, password: employee.password });
  const ownAttributions = await directCaller.from("productivity_attributions").select("credited_area_m2").eq("studio_id", studioId);
  expect(ownAttributions.error).toBeNull();
  expect(ownAttributions.data).toEqual([]);
  const ownNotes = await directCaller.from("employee_profile_notes").select("id,note").eq("employee_id", employee.id);
  expect(ownNotes.error).toBeNull();
  expect(ownNotes.data).toEqual([]);

  const lowDataPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(lowDataPage, 4);
  await lowDataPage.goto(`/team/${accounts[4].id}`);
  await expect(lowDataPage.getByRole("heading", { name: en.EmployeeProfile.personalActivity, exact: true })).toBeVisible();
  await expect(lowDataPage.getByText(en.EmployeeProfile.noProjects, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(lowDataPage);
  await expectRecentCalendarVisible(lowDataPage);
  const beforeJoining = lowDataPage.locator('button[data-kind="before_joining"]').first();
  await beforeJoining.click();
  await expect(lowDataPage.getByRole("tooltip")).toContainText(en.EmployeeProfile.heatmapBeforeJoining);
  await expect(lowDataPage.getByRole("tooltip")).not.toContainText("0 completed tasks");
  await expect(lowDataPage.getByRole("tooltip")).toBeInViewport({ ratio: 1 });
  await lowDataPage.screenshot({ path: ".local/profile-second-pass/renders/after/low-data-before-joining-tooltip-mobile.png", animations: "disabled" });
  const future = lowDataPage.locator('button[data-kind="future"]');
  if (await future.count()) {
    await future.first().click();
    await expect(lowDataPage.getByRole("tooltip")).toContainText(en.EmployeeProfile.heatmapFuture);
  }
  await lowDataPage.locator('button[data-date]').last().focus();
  await lowDataPage.getByRole("heading", { name: en.EmployeeProfile.personalActivity, exact: true }).click();
  await saveOverviewScreenshots(lowDataPage, "low-data-own-profile-mobile");
  await lowDataPage.close();

  await employeePage.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://localhost:3000", sameSite: "Lax" }]);
  await employeePage.goto(`/team/${employee.id}`);
  await expect(employeePage.getByRole("heading", { name: uk.EmployeeProfile.personalActivity, exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(employeePage);
  await saveOverviewScreenshots(employeePage, "employee-own-profile-uk-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://localhost:3000", sameSite: "Lax" }]);
  await page.goto(`/team/${employee.id}`);
  await expect(page.getByRole("heading", { name: uk.EmployeeProfile.contribution, exact: true })).toBeVisible();
  await saveOverviewScreenshots(page, "admin-employee-uk-desktop");

  const foreignResponse = await page.goto(`/team/${accounts[3].id}`);
  expect(foreignResponse?.status()).toBe(404);
  await employeePage.close();
  await colleaguePage.close();
});
