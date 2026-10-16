import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import { getCalendarEventTypeConfig } from "../../src/lib/calendar-event-types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_PUBLISHABLE_KEY: z.string(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Statistics tests require local Supabase");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const projectId = randomUUID();
const auditlessCompletedProjectId = randomUUID();
const ongoingProjectId = randomUUID();
const taskIds = [randomUUID(), randomUUID()] as const;
const siteVisitEventId = randomUUID();
const makeAccount = (role: "admin" | "employee") => ({ role, id: "", email: `statistics-${role}-${randomUUID()}@example.test`, password: `Stats-${randomUUID()}` });
const accounts = [makeAccount("admin"), makeAccount("employee")] as const;
const renderDir = ".local/statistics/renders";
mkdirSync(renderDir, { recursive: true });

function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}
async function login(page: Page, index: 0 | 1 = 0) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://localhost:3000" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(accounts[index].email);
  await page.locator('input[type="password"]').fill(accounts[index].password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}
async function settleCharts(page: Page) {
  const charts = page.locator('svg[role="group"]');
  if (await charts.count()) await expect.poll(() => charts.evaluateAll(elements => elements.every(element => {
    const svg = element as SVGSVGElement;
    return Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width) < 1;
  }))).toBe(true);
}

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Statistics browser test" }).throwOnError();
  for (const account of accounts) {
    const result = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
    if (result.error) throw result.error;
    account.id = result.data.user.id;
    await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: `Statistics ${account.role}`, system_role: account.role, is_active: true }).throwOnError();
    await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: account.role, is_active: true }).throwOnError();
  }
  const admin = accounts[0], employee = accounts[1];
  sql(`
    insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by)
    values (${id(projectId)},${id(studioId)},'Statistics production fixture',100,'planned',current_date-45,${id(admin.id)}),
      (${id(auditlessCompletedProjectId)},${id(studioId)},'Statistics completion audit gap',0,'planned',current_date-35,${id(admin.id)}),
      (${id(ongoingProjectId)},${id(studioId)},'Statistics ongoing duration fixture',0,'planned',current_date-12,${id(admin.id)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
    values (${id(projectId)},${id(admin.id)},'designer',0,current_date),(${id(projectId)},${id(employee.id)},'designer',0,current_date),
      (${id(auditlessCompletedProjectId)},${id(admin.id)},'designer',0,current_date),(${id(ongoingProjectId)},${id(admin.id)},'designer',0,current_date);
    insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by,completed_area_m2)
    values (${id(taskIds[0])},${id(projectId)},'Statistics credit A','stage_2','todo','normal',${id(admin.id)},${id(admin.id)},100),
      (${id(taskIds[1])},${id(projectId)},'Statistics credit B','stage_2','todo','normal',${id(employee.id)},${id(admin.id)},100);
    select set_config('request.jwt.claim.sub',${id(admin.id)},false);
    update public.projects set status='active' where id in (${id(projectId)},${id(auditlessCompletedProjectId)},${id(ongoingProjectId)});
    update public.projects set started_at=current_date-45 where id=${id(projectId)};
    update public.projects set started_at=current_date-35 where id=${id(auditlessCompletedProjectId)};
    update public.projects set started_at=current_date-12 where id=${id(ongoingProjectId)};
    update public.project_activity set created_at=(current_date-45)::timestamp
      where project_id=${id(projectId)} and entity_type='project' and action_type='project_lifecycle_changed'
        and changes->'status'->>'from'='planned' and changes->'status'->>'to'='active';
    update public.project_activity set created_at=(current_date-35)::timestamp
      where project_id=${id(auditlessCompletedProjectId)} and entity_type='project' and action_type='project_lifecycle_changed'
        and changes->'status'->>'from'='planned' and changes->'status'->>'to'='active';
    update public.project_activity set created_at=(current_date-12)::timestamp
      where project_id=${id(ongoingProjectId)} and entity_type='project' and action_type='project_lifecycle_changed'
        and changes->'status'->>'from'='planned' and changes->'status'->>'to'='active';
    update public.tasks set status='in_progress' where project_id=${id(projectId)};
    update public.tasks set status='completed' where project_id=${id(projectId)};
    update public.tasks set completed_at=current_date-10 where project_id=${id(projectId)};
    update public.projects set status='completed' where id in (${id(projectId)},${id(auditlessCompletedProjectId)});
    update public.projects set completed_at=current_date-10 where id=${id(projectId)};
    update public.projects set completed_at=current_date-5 where id=${id(auditlessCompletedProjectId)};
    delete from public.project_activity
      where project_id=${id(auditlessCompletedProjectId)} and entity_type='project' and action_type='project_lifecycle_changed'
        and changes->'status'->>'from'='active' and changes->'status'->>'to'='completed';
    insert into public.crm_leads(studio_id,client_name,first_contact_date,status,source,internal_notes,created_at)
    values (${id(studioId)},'Statistics cohort lead',current_date-20,'new','referral','STATISTICS_PRIVATE_CRM',(current_date-22)::timestamp);
    update public.crm_leads set status='contacted' where studio_id=${id(studioId)} and client_name='Statistics cohort lead';
    update public.crm_lead_history set created_at=(current_date-20)::timestamp
      where lead_id=(select id from public.crm_leads where studio_id=${id(studioId)} and client_name='Statistics cohort lead') and event_type='status_changed';
    update public.crm_leads set status='discussion' where studio_id=${id(studioId)} and client_name='Statistics cohort lead';
    update public.crm_lead_history set created_at=(current_date-17)::timestamp
      where lead_id=(select id from public.crm_leads where studio_id=${id(studioId)} and client_name='Statistics cohort lead') and event_type='status_changed'
        and new_status='discussion';
    insert into public.time_off_requests(studio_id,user_id,request_type,start_date,end_date,all_day,status,private_note)
    values (${id(studioId)},${id(admin.id)},'sick_leave',current_date-3,current_date-2,true,'approved','STATISTICS_PRIVATE_HR');
    insert into public.calendar_events(studio_id,project_id,title,event_type,starts_at,ends_at,all_day,organizer_id,created_by,meeting_mode)
    values (${id(studioId)},${id(projectId)},'Statistics meeting','meeting',(current_date-5)+time '10:00',(current_date-5)+time '11:00',false,${id(admin.id)},${id(admin.id)},'offline');
    insert into public.calendar_events(id,studio_id,project_id,title,event_type,starts_at,ends_at,all_day,organizer_id,created_by)
    values (${id(siteVisitEventId)},${id(studioId)},${id(projectId)},'Statistics multi-person site visit','site_visit',(current_date-5)+time '14:00',(current_date-5)+time '15:00',false,${id(admin.id)},${id(admin.id)});
    insert into public.calendar_event_participants(event_id,user_id,assigned_by)
    values (${id(siteVisitEventId)},${id(admin.id)},${id(admin.id)}),(${id(siteVisitEventId)},${id(employee.id)},${id(admin.id)});
    insert into public.calendar_events(studio_id,title,event_type,starts_at,ends_at,all_day,organizer_id,created_by,recurrence_rule)
    values (${id(studioId)},'Statistics recurring makeup','work_makeup',(current_date-5)+time '12:00',(current_date-5)+time '13:00',false,${id(admin.id)},${id(admin.id)},'{"frequency":"daily","interval":1,"weekdays":[],"endsOn":null,"occurrenceCount":3}'::jsonb);


  `);
  expect(sql(`select status||'|'||completed_at||'|'||total_area_m2 from public.projects where id=${id(projectId)}`)).toMatch(/^completed\|\d{4}-\d{2}-\d{2}\|100$/);
  expect(sql(`select sum(credited_area_m2) from public.productivity_attributions where project_id=${id(projectId)} and voided_at is null`)).toBe("200");
  expect(sql(`select count(*) from public.project_activity where project_id=${id(auditlessCompletedProjectId)} and changes->'status'->>'to'='active'`)).toBe("1");
  expect(sql(`select count(*) from public.project_activity where project_id=${id(auditlessCompletedProjectId)} and changes->'status'->>'to'='completed'`)).toBe("0");
  expect(sql(`select count(*) from public.crm_lead_history where studio_id=${id(studioId)} and actor_id=${id(admin.id)}`)).toBe("3");
  expect(sql(`select count(*) from public.calendar_event_participants where event_id=${id(siteVisitEventId)}`)).toBe("2");
});

test.afterAll(async () => {
  sql(`select set_config('request.jwt.claim.sub',${id(accounts[0].id)},false);
    delete from public.calendar_event_participants where event_id in (select id from public.calendar_events where studio_id=${id(studioId)});
    delete from public.calendar_events where studio_id=${id(studioId)};
    delete from public.crm_leads where studio_id=${id(studioId)};
    delete from public.time_off_requests where studio_id=${id(studioId)};
    delete from public.tasks where project_id in (${id(projectId)},${id(auditlessCompletedProjectId)},${id(ongoingProjectId)});
    delete from public.project_members where project_id in (${id(projectId)},${id(auditlessCompletedProjectId)},${id(ongoingProjectId)});
    delete from public.projects where id in (${id(projectId)},${id(auditlessCompletedProjectId)},${id(ongoingProjectId)});
    delete from public.studios where id=${id(studioId)};`);
  for (const account of accounts) if (account.id) {
    const result = await service.auth.admin.deleteUser(account.id);
    if (result.error) sql(`delete from auth.users where id=${id(account.id)};`);
  }
});

test("admin can open Statistics, change periods, and render at common widths", async ({ page }, testInfo) => {
  await login(page);
  const navLink = page.getByRole("link", { name: "Statistics", exact: true });
  await expect(navLink).toBeVisible();
  await navLink.click();
  await expect(page).toHaveURL(/\/statistics(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Statistics", exact: true })).toBeVisible();
  for (const id of ["stats-production", "stats-credits", "stats-duration"]) await expect(page.locator(`#${id}`)).toBeVisible();
  await expect(page.locator("#stats-economics")).toHaveCount(0);
  await expect(page.getByText("View monthly data", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Current month is partial/).first()).toBeVisible();
  await expect(page.locator("#stats-production")).toContainText("100");
  await expect(page.locator("#stats-credits")).toContainText("200");

  const creditChart = page.locator("#stats-credits").getByRole("group").first();
  const point = creditChart.locator('[role="button"][data-point]').first();
  await point.focus();
  await expect(page.locator("#stats-credits div[aria-hidden='true']").filter({ hasText: /200/ })).toBeVisible();
  await point.tap();

  for (const [period, label] of [["3", "3 months"], ["6", "6 months"], ["12", "12 months"], ["year", "This year"], ["all", "All history"]] as const) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]period=${period}(?:&|$)`));
    await expect(page.getByRole("heading", { name: "Statistics", exact: true })).toBeVisible();
    if (period === "3") {
      const selected = page.locator('#stats-credits [role="button"][tabindex="0"]').last();
      await expect(selected).toBeVisible();
      await selected.focus();
      await expect(page.locator("#stats-credits div[aria-hidden='true']").filter({ hasText: /200/ })).toBeVisible();
    }
  }

  await expect(page.getByTestId("duration-highlight")).toHaveCount(2);
  await expect(page.locator("#stats-duration")).toContainText("Statistics completion audit gap");
  await expect(page.locator("#stats-ongoing")).toContainText("Statistics ongoing duration fixture");
  await expect(page.locator("#stats-ongoing")).toContainText("12 days");
  const info = page.getByRole("button", { name: "How calculated: Physical area of completed projects", exact: true });
  await info.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Physical area of completed projects", exact: true })).toContainText("not a historical area snapshot");
  await page.keyboard.press("Escape");
  await expect(info).toBeFocused();
  for (const [section, label] of [["leads", "Leads"], ["team", "Team"], ["calendar", "Calendar"], ["overview", "Overview"]] as const) {
    await page.getByRole("navigation", { name: "Statistics sections" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`period=all&section=${section}`));
    await expect(page.locator(section === "overview" ? "#stats-production" : `#stats-${section}`)).toBeVisible();
    await expect(page.locator("main")).not.toContainText("STATISTICS_PRIVATE");
    if (section === "team") await expect(page.locator("#stats-team tbody tr").filter({ hasText: "Statistics admin" })).toContainText("3");
  }
  await page.getByRole("navigation", { name: "Statistics sections" }).getByRole("link", { name: "Leads", exact: true }).click();
  await expect(page.locator("#stats-leads")).toBeVisible();
  await page.getByRole("link", { name: "This year", exact: true }).click();
  await expect(page).toHaveURL(/period=year&section=leads/);
  await expect(page.locator("#stats-leads")).toContainText("0 won / 1 valid leads");
  const timingRows = page.locator("#stats-lead-timing tbody tr");
  await expect(timingRows.nth(0).locator("td").nth(0)).toHaveText("2");
  await expect(timingRows.nth(1).locator("td").nth(0)).toHaveText("3");
  await page.goto("/statistics?period=year&section=calendar");
  await expect(page.locator("#stats-calendar-people")).toBeVisible();
  const totalEventsLabel = page.getByText("Elapsed scheduled events", { exact: true });
  await expect(totalEventsLabel.locator("xpath=following-sibling::p")).toContainText("2");
  const siteVisitBar = page.locator('#stats-calendar [data-event-type="site_visit"]');
  await expect(siteVisitBar).toHaveAttribute("style", new RegExp(getCalendarEventTypeConfig("site_visit").color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect(siteVisitBar.locator("xpath=../..")).toContainText("1");
  await expect(siteVisitBar.locator("xpath=../..").locator("svg")).toHaveClass(/lucide-map-pin/);
  await expect(page.getByText("Internal reviews", { exact: true })).toHaveCount(0);
  await expect(page.locator("#stats-calendar-months details")).toHaveCount(0);
  const stackedChart = page.locator("#stats-calendar-months").getByRole("group").first();
  for (const type of ["meeting", "site_visit"] as const) await expect(stackedChart.locator(`[data-segment="${type}"]`)).toHaveAttribute("fill", getCalendarEventTypeConfig(type).color);
  const populatedMonth = stackedChart.getByRole("button").filter({ hasText: "2" });
  await populatedMonth.hover();
  const stackedTooltip = page.locator("#stats-calendar-months div[aria-hidden='true']");
  await expect(stackedTooltip).toContainText("Total: 2");
  await expect(stackedTooltip).toContainText("Meetings");
  await expect(stackedTooltip).toContainText("Site visits");
  await populatedMonth.focus();
  await expect(populatedMonth).toHaveAttribute("aria-label", /Meetings: 1.*Site visits: 1/);
  const adminPeopleRow = page.locator("#stats-calendar-people tbody tr").filter({ hasText: "Statistics admin" });
  const employeePeopleRow = page.locator("#stats-calendar-people tbody tr").filter({ hasText: "Statistics employee" });
  await expect(adminPeopleRow.locator("td").nth(0)).toHaveText("2");
  await expect(adminPeopleRow.locator("td").nth(1)).toContainText("2");
  await expect(employeePeopleRow.locator("td").nth(0)).toHaveText("1");
  await expect(employeePeopleRow.locator("td").nth(1)).toContainText("1");

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/statistics?period=12");
    await expect(page.getByRole("heading", { name: "Statistics", exact: true })).toBeVisible();
    await settleCharts(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${renderDir}/statistics-${width}.png`, fullPage: true });
    if (width === 390) {
      await page.getByRole("button", { name: "How calculated: Physical area of completed projects", exact: true }).click();
      await page.screenshot({ path: `${renderDir}/statistics-overview-info-${width}.png` });
      await page.keyboard.press("Escape");
    }
    await page.locator("#stats-duration").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${renderDir}/statistics-overview-duration-${width}.png` });
    for (const section of ["leads", "team", "calendar"]) {
      await page.goto(`/statistics?period=year&section=${section}`);
      await expect(page.locator(`#stats-${section}`)).toBeVisible();
      await settleCharts(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `${renderDir}/statistics-${section}-${width}.png`, fullPage: true });
      const detail = section === "leads" ? "#stats-lead-timing" : section === "calendar" ? "#stats-calendar-people" : "#stats-team";
      await page.locator(detail).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${renderDir}/statistics-${section}-detail-${width}.png` });
    }

  }
  await testInfo.attach("statistics-render-directory", { body: renderDir, contentType: "text/plain" });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://localhost:3000" }]);
  await page.goto("/statistics?period=year&section=leads");
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(page.locator("#stats-leads")).toContainText("Рекомендація");
  await expect(page.locator("#stats-lead-timing")).toContainText("Контакт встановлено");
  await expect(page.locator("#stats-lead-timing")).toContainText("Обговорення");
});

test("employee cannot navigate to or read private Statistics data", async ({ page }) => {
  await login(page, 1);
  await expect(page.getByRole("link", { name: "Statistics", exact: true })).toHaveCount(0);
  await page.goto("/statistics");
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

  const employee = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await employee.auth.signInWithPassword({ email: accounts[1].email, password: accounts[1].password });
  if (signedIn.error) throw signedIn.error;
  for (const section of ["leads", "team", "calendar"]) {
    await page.goto(`/statistics?section=${section}&period=all`);
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  }
  const [attributions, payroll, projectTerms, leads, privateTimeOff] = await Promise.all([
    employee.from("productivity_attributions").select("id"),
    employee.from("finance_obligations").select("id"),
    employee.from("finance_project_terms").select("id"),
    employee.from("crm_leads").select("id"),
    employee.from("time_off_requests").select("id,private_note").eq("user_id", accounts[0].id),
  ]);
  expect(attributions.error || attributions.data.length === 0).toBeTruthy();
  expect(payroll.error || payroll.data.length === 0).toBeTruthy();
  expect(projectTerms.error || projectTerms.data.length === 0).toBeTruthy();
  expect(leads.error || leads.data.length === 0).toBeTruthy();
  expect(privateTimeOff.error || privateTimeOff.data.length === 0).toBeTruthy();
  await employee.auth.signOut();
});

test("Team work time reconciles summary, chart and people after changing the period", async ({ page }, testInfo) => {
  const current = sql("select (current_date-5)::text");
  const older = sql("select (date_trunc('month',current_date)-interval '4 months')::date");
  const ongoingTaskId = randomUUID();
  sql(`select set_config('request.jwt.claim.sub',${id(accounts[0].id)},false);
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values (${id(ongoingProjectId)},${id(accounts[1].id)},'designer',0,current_date);
    insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by)
    values (${id(ongoingTaskId)},${id(ongoingProjectId)},'Statistics ongoing work','stage_2','in_progress','normal',${id(accounts[1].id)},${id(accounts[0].id)});`);
  const rounds = [randomUUID(), randomUUID()];
  await service.from("task_review_rounds").insert(rounds.map((roundId, index) => ({
    id: roundId, task_id: taskIds[1], project_id: projectId, round_number: index + 1, reviewer_id: accounts[0].id,
    submitted_at: `${index ? current : older}T10:00:00Z`, completed_at: `${index ? current : older}T11:00:00Z`, result: "approved",
  }))).throwOnError();
  await service.from("task_review_round_reviewers").insert(rounds.map((roundId, index) => ({
    round_id: roundId, reviewer_id: accounts[0].id, position: 0, approved_at: `${index ? current : older}T11:00:00Z`,
  }))).throwOnError();
  await service.from("work_log_entries").insert([
    { studio_id: studioId, user_id: accounts[0].id, work_date: current, activity_kind: "task", task_id: taskIds[0], minutes: 91 },
    { studio_id: studioId, user_id: accounts[1].id, work_date: current, activity_kind: "task", task_id: taskIds[1], minutes: 120 },
    { studio_id: studioId, user_id: accounts[0].id, work_date: current, activity_kind: "review", task_id: taskIds[1], review_round_id: rounds[1], minutes: 31 },
    { studio_id: studioId, user_id: accounts[1].id, work_date: older, activity_kind: "task", task_id: ongoingTaskId, minutes: 60 },
    { studio_id: studioId, user_id: accounts[0].id, work_date: older, activity_kind: "review", task_id: taskIds[1], review_round_id: rounds[0], minutes: 60 },
  ]).throwOnError();
  const oldVisit = randomUUID();
  // Calendar fixtures use the same direct local setup as beforeAll; service-role
  // table writes are deliberately unavailable for this domain.
  sql(`select set_config('request.jwt.claim.sub',${id(accounts[0].id)},false);
    insert into public.calendar_events(id,studio_id,project_id,title,event_type,starts_at,ends_at,all_day,organizer_id,created_by)
    values (${id(oldVisit)},${id(studioId)},${id(projectId)},'Older employee visit','site_visit','${older}T12:00:00Z','${older}T13:15:00Z',false,${id(accounts[0].id)},${id(accounts[0].id)});
    insert into public.calendar_event_participants(event_id,user_id,assigned_by)
    values (${id(oldVisit)},${id(accounts[1].id)},${id(accounts[0].id)});`);

  const tripIds = Array.from({ length: 4 }, () => randomUUID());
  sql(`select set_config('request.jwt.claim.sub',${id(accounts[0].id)},false);
    insert into public.calendar_events(id,studio_id,project_id,title,event_type,starts_at,ends_at,all_day,organizer_id,created_by)
    values (${id(tripIds[0])},${id(studioId)},${id(projectId)},'Measured trip','business_trip','${current}T09:00:00Z','${current}T14:00:00Z',false,${id(accounts[0].id)},${id(accounts[0].id)}),
      ${tripIds.slice(1).map((tripId, index) => `(${id(tripId)},${id(studioId)},${id(projectId)},'All-day trip','business_trip',
        '${current}'::date::timestamp at time zone 'Europe/Kyiv',('${current}'::date+${index === 2 ? 2 : 1})::timestamp at time zone 'Europe/Kyiv',
        true,${id(accounts[0].id)},${id(accounts[0].id)})`).join(",")};
    insert into public.calendar_event_participants(event_id,user_id,assigned_by)
    values ${tripIds.map(tripId => `(${id(tripId)},${id(accounts[0].id)},${id(accounts[0].id)})`).join(",")};`);

  await login(page);
  await page.goto("/statistics?period=3&section=team");
  const minutes = (text: string) => {
    const [hours, minute] = text.split(":").map(Number);
    return hours * 60 + minute;
  };
  const verify = async (expected: { summary: string[]; admin: string[]; employee: string[]; projects: string[][] }) => {
    const work = page.locator("#stats-work");
    await expect(work.getByRole("heading", { name: /^Work time/ })).toBeVisible();
    await expect(page.locator("[data-statistics-motion]").filter({ has: work })).toHaveAttribute("data-statistics-motion", "complete");
    await expect(work.getByRole("button", { name: "By employee", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(work.locator("#stats-work-projects")).toHaveCount(0);
    await expect(work.locator('[data-segment="calendarMinutes"]')).toHaveCount(0);
    const summary = page.getByTestId("work-summary").locator(":scope > div > p:nth-child(2) > span:first-child");
    await expect(summary).toHaveText(expected.summary);
    const rows = [];
    for (const [name, values] of [["Statistics admin", expected.admin], ["Statistics employee", expected.employee]] as const) {
      const row = work.locator("#stats-work-people > ul > li").filter({ hasText: name });
      const toggle = row.getByRole("button");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(row.getByRole("link")).toBeVisible();
      const metrics = await row.locator("[data-work-metric]").allTextContents();
      const total = (await row.locator("[data-work-total]").innerText()).split(" ")[0];
      const actual = [...metrics.slice(0, 3), total, ...metrics.slice(3)];
      expect(actual).toEqual(values);
      rows.push(actual);
      await toggle.click();
    }
    const summaryValues = await summary.allTextContents();
    expect(rows.reduce((sum, row) => sum + minutes(row[3]), 0)).toBe(minutes(summaryValues[0]));
    for (const [column, summaryColumn] of [[0, 1], [1, 2], [2, 3], [4, 4], [5, 5]]) {
      const parse = column >= 4 ? Number : minutes;
      expect(rows.reduce((sum, row) => sum + parse(row[column]), 0)).toBe(parse(summaryValues[summaryColumn]));
    }
    for (const row of rows) expect(minutes(row[0]) + minutes(row[1]) + minutes(row[2])).toBe(minutes(row[3]));
    await work.getByRole("button", { name: "By project", exact: true }).click();
    await expect(work.locator("#stats-work-people")).toHaveCount(0);
    const projectRows = work.locator("#stats-work-projects > ul > li");
    await expect(projectRows).toHaveCount(expected.projects.length);
    for (const [index, values] of expected.projects.entries()) {
      await expect(projectRows.nth(index).locator("[data-work-metric]")).toHaveText(values.slice(0, 2));
      await expect(projectRows.nth(index).locator("[data-work-total]")).toHaveText(`${values[2]} h:mm`);
    }
    await projectRows.first().getByRole("button").click();
    await expect(projectRows.first().getByRole("link")).toBeVisible();
    await expect(projectRows.first().getByRole("link")).toHaveAttribute("href", `/projects/${projectId}`);
    const projectValues = await projectRows.evaluateAll(elements => elements.map(row => [
      ...Array.from(row.querySelectorAll("[data-work-metric]"), cell => cell.textContent ?? ""),
      (row.querySelector("[data-work-total]")?.textContent ?? "").split(" ")[0],
    ]));
    for (const [column, summaryColumn] of [[0, 1], [1, 2], [2, 0]]) {
      expect(projectValues.reduce((sum, row) => sum + minutes(row[column]), 0)).toBe(minutes(summaryValues[summaryColumn]));
    }
    const largestProject = Math.max(...projectValues.map(row => minutes(row[2])));
    const barWidths = await projectRows.locator("[data-statistics-progress]").evaluateAll(elements => elements.map(element => parseFloat(element.style.width)));
    barWidths.forEach((width, index) => expect(width).toBeCloseTo(minutes(projectValues[index][2]) / largestProject * 100));
    const monthly = work.getByRole("button", { name: "Monthly trend", exact: true });
    await expect(monthly).toHaveAttribute("aria-expanded", "false");
    await monthly.click();
    await expect(work.locator("#stats-work-months")).toBeVisible();
    await settleCharts(page);
    const points = page.locator("#stats-work-months").getByRole("button");
    expect((await points.allTextContents()).reduce((sum, text) => sum + minutes(text), 0)).toBe(minutes(summaryValues[0]));
    const labels = await points.evaluateAll(elements => elements.map(element => element.getAttribute("aria-label") ?? ""));
    const totals = ["Task work", "Reviews"].map(source => labels.reduce((sum, label) => {
      const duration = label.match(new RegExp(`${source}: ([\\d:]+)`))?.[1];
      if (!duration) throw new Error(`Missing ${source} chart breakdown`);
      return sum + minutes(duration);
    }, 0));
    totals.forEach((total, index) => expect(total).toBe(minutes(summaryValues[index + 1])));
    await monthly.click();
    await expect(work.locator("#stats-work-months")).not.toBeVisible();
    await expect(page.locator("#stats-team").getByRole("heading", { name: /^Time off and make-up/ })).toBeVisible();
    const attendance = page.locator("#stats-team tbody tr").filter({ hasText: "Statistics admin" });
    await expect(attendance.locator("td").nth(2)).toContainText("2 cal. days");
    await expect(attendance.locator("td").nth(3)).toHaveText("3:00");
  };
  await verify({ summary: ["4:02", "3:31", "0:31", "0:00", "1", "0"], admin: ["1:31", "0:31", "0:00", "2:02", "1", "0"], employee: ["2:00", "0:00", "0:00", "2:00", "0", "0"], projects: [["3:31", "0:31", "4:02"]] });
  await page.getByRole("link", { name: "12 months", exact: true }).click();
  await expect(page).toHaveURL(/period=12&section=team/);
  await verify({ summary: ["6:02", "4:31", "1:31", "0:00", "2", "0"], admin: ["1:31", "1:31", "0:00", "3:02", "2", "0"], employee: ["3:00", "0:00", "0:00", "3:00", "0", "0"], projects: [["3:31", "1:31", "5:02"], ["1:00", "0:00", "1:00"]] });
  const screenshot = `${renderDir}/statistics-team-work-time.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach("team-work-time", { path: screenshot, contentType: "image/png" });
  await page.getByRole("navigation", { name: "Statistics sections" }).getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL(/period=12&section=calendar/);
  const calendarPeople = page.locator("#stats-calendar-people");
  await expect(calendarPeople).toBeVisible();
  await expect(calendarPeople.locator("tbody tr").filter({ hasText: "Statistics admin" }).locator("td").nth(1)).toHaveText("7:00 h:mm");
  await expect(calendarPeople.locator("tbody tr").filter({ hasText: "Statistics employee" }).locator("td").nth(1)).toHaveText("2:15 h:mm");
  const tripCategory = page.locator('[data-calendar-category="business_trip"]');
  await expect(tripCategory).toContainText("4 events");
  await expect(tripCategory).toContainText("5:00 h:mm");
  await expect(tripCategory.locator("[data-calendar-all-day]")).toHaveText("All-day: 3 events, 4 cal. days");
  await page.getByRole("navigation", { name: "Statistics sections" }).getByRole("link", { name: "Team", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await settleCharts(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator("#stats-work")).toBeVisible();
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://localhost:3000" }]);
  await page.goto("/statistics?period=12&section=team");
  await expect(page.locator("#stats-work").getByRole("heading", { name: /^Робочий час/ })).toBeVisible();
  await page.locator("#stats-work").getByRole("button", { name: "За проєктами", exact: true }).click();
  await expect(page.getByRole("region", { name: "За проєктами", exact: true })).toBeVisible();
  await expect(page.locator("#stats-team").getByRole("heading", { name: /^Відсутності та відпрацювання/ })).toBeVisible();
  await expect(page.locator("[data-statistics-motion]")).toHaveAttribute("data-statistics-motion", "complete");
  const mobileScreenshot = `${renderDir}/statistics-team-projects-mobile.png`;
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  await testInfo.attach("team-projects-mobile", { path: mobileScreenshot, contentType: "image/png" });
  await page.goto("/statistics?period=12&section=calendar");
  await expect(page.locator('[data-calendar-category="business_trip"] [data-calendar-all-day]')).toHaveText("На весь день: 3 події, 4 кал. дн.");
  await expect(page.locator("[data-statistics-motion]")).toHaveAttribute("data-statistics-motion", "complete");
  await settleCharts(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
