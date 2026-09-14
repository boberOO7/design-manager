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
const accounts = ["admin", "employee"].map((role) => ({ role, id: "", email: `office-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
function sqlId(value: string) { return `'${z.uuid().parse(value)}'`; }
function localSql(sql: string) {
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
async function openCreation(page: Page, kind: "assignment" | "submission") {
  await page.getByRole("button", { name: en.Office.create, exact: true }).click();
  await page.getByRole("link", { name: new RegExp(`^${en.Office.chooser[kind]}`) }).click();
  await expect(page.getByRole("dialog", { name: kind === "assignment" ? en.OfficeAssignments.form.title : en.Submissions.form.title, exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  await admin.from("studios").insert({ id: studioId, name: "Office reconciliation test" }).throwOnError();
  for (const account of accounts) {
    const user = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
    if (user.error) throw user.error;
    account.id = user.data.user.id;
    const role = account.role === "admin" ? "admin" : "employee";
    await admin.from("profiles").upsert({ id: account.id, email: account.email, full_name: `Office ${role}`, system_role: role, is_active: true }).throwOnError();
    await admin.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: role, is_active: true }).throwOnError();
  }
});
test.afterAll(async () => {
  localSql(`delete from public.studios where id=${sqlId(studioId)};`);
  for (const account of accounts) if (account.id) { const result = await admin.auth.admin.deleteUser(account.id); if (result.error) throw result.error; }
});

test("Assignment overlays preserve history and reconcile row, detail and creation mutations once", async ({ page }) => {
  const t = en.OfficeAssignments;
  const ids = [randomUUID(), randomUUID()];
  for (const [i, id] of ids.entries()) localSql(`insert into public.office_assignments(id,studio_id,creator_id,responsible_id,title) values (${sqlId(id)},${sqlId(studioId)},${sqlId(accounts[0].id)},${sqlId(accounts[0].id)},'Routing assignment ${i}');`);
  await login(page);
  const check = observeWorkspace(page, "/office/assignments");
  await page.goto("/office/assignments");
  await expect(page.getByRole("button", { name: `${t.eyebrow}: Routing assignment 0`, exact: true })).toBeVisible();
  await check("load", ["GET"]);
  const historyLength = await page.evaluate(() => history.length);
  for (const [label, index] of [["open", 0], ["reopen", 0], ["switch", 1]] as const) {
    await page.getByRole("button", { name: `${t.eyebrow}: Routing assignment ${index}`, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: `Routing assignment ${index}`, exact: true });
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`item=${ids[index]}`));
    await check(label, []);
    if (index === 0) {
      await drawer.getByRole("button", { name: t.close, exact: true }).click();
      await expect(drawer).toHaveCount(0);
      await check("close", []);
    }
  }
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  let drawer = page.getByRole("dialog", { name: "Routing assignment 1", exact: true });
  await choose(page, drawer, t.admin.priority, t.priorities.high);
  await drawer.getByRole("button", { name: t.admin.save, exact: true }).click();
  await expect(drawer.getByRole("button", { name: t.admin.save, exact: true })).toBeEnabled();
  await expect(drawer.locator("header")).toContainText(t.priorities.high);
  await check("manage assignment", ["action"]);
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  const row = page.locator("article").filter({ hasText: "Routing assignment 1" });
  await row.getByRole("button", { name: t.actions.in_progress, exact: true }).click();
  await expect(row).toContainText(t.statuses.in_progress);
  await check("row transition", ["action"]);
  await openCreation(page, "assignment");
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  await check("open creation", []);
  await page.goBack(); await expect(page.getByRole("dialog")).toHaveCount(0); await check("Back", []);
  await page.goForward(); await expect(page.getByRole("dialog")).toBeVisible(); await check("Forward", []);
  drawer = page.getByRole("dialog");
  await drawer.locator('[name="title"]').fill("Created routing assignment");
  await choose(page, drawer, t.form.responsible, "Office admin");
  await drawer.getByRole("button", { name: t.form.submit, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Created routing assignment", exact: true })).toBeVisible();
  await check("create assignment", ["action"]);
  await page.goto(`/office/assignments?item=${ids[1]}`);
  drawer = page.getByRole("dialog", { name: "Routing assignment 1", exact: true });
  await expect(drawer.locator("header")).toContainText(t.statuses.in_progress);
  await expect(drawer.locator("header")).toContainText(t.priorities.high);
  await check("direct URL", ["GET"]);
  // A real rejected RPC retains its error and the unsaved form value.
  localSql(`update public.office_assignments set status='done' where id=${sqlId(ids[1])};`);
  await drawer.getByRole("button", { name: t.admin.save, exact: true }).click();
  await expect(drawer.getByRole("alert")).toBeVisible();
  await expect(drawer.getByRole("combobox", { name: t.admin.priority, exact: true })).toContainText(t.priorities.high);
  await check("failed assignment", ["action"]);
});

test("Submission overlays retain live discussion, reactions and private administration", async ({ page, browser }) => {
  const t = en.Submissions;
  const ids = [randomUUID(), randomUUID()];
  for (const [i, id] of ids.entries()) localSql(`insert into public.submissions(id,studio_id,author_id,type,title,description) values (${sqlId(id)},${sqlId(studioId)},${sqlId(accounts[0].id)},'suggestion','Routing suggestion ${i}','Discussion fixture');`);
  const joined = new Set<string>();
  page.on("websocket", (socket) => socket.on("framereceived", (event) => {
    const payload = String(event.payload);
    for (const id of ids) if (payload.includes(`submission-comments:${id}`) && payload.includes('"status":"ok"')) joined.add(id);
  }));
  await login(page);
  const check = observeWorkspace(page, "/office/submissions");
  await page.goto("/office/submissions");
  await expect(page.getByRole("button", { name: "Suggestion: Routing suggestion 0", exact: true })).toBeVisible();
  await check("load", ["GET"]);
  for (const [label, index] of [["open", 0], ["reopen", 0], ["switch", 1]] as const) {
    await page.getByRole("button", { name: `Suggestion: Routing suggestion ${index}`, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: `Routing suggestion ${index}`, exact: true });
    await expect(drawer).toBeVisible(); await check(label, []);
    if (index === 0) {
      if (label === "open") {
        await expect.poll(() => joined.has(ids[0])).toBe(true);
        localSql(`insert into public.submission_comments(submission_id,studio_id,author_id,body) values (${sqlId(ids[0])},${sqlId(studioId)},${sqlId(accounts[1].id)},'Received live comment');`);
      }
      await expect(drawer.getByText("Received live comment", { exact: true })).toHaveCount(1);
      await drawer.getByRole("button", { name: t.close, exact: true }).click();
      await expect(drawer).toHaveCount(0); await check("close", []);
    }
  }
  let drawer = page.getByRole("dialog", { name: "Routing suggestion 1", exact: true });
  await drawer.getByRole("button", { name: "Support · 0", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Supported · 1", exact: true })).toBeEnabled();
  await check("drawer reaction", ["action"]);
  await drawer.getByLabel(t.comment, { exact: true }).fill("Saved discussion comment");
  await drawer.getByRole("button", { name: t.send, exact: true }).click();
  await expect(drawer.getByLabel(t.comment, { exact: true })).toHaveValue("");
  await expect(drawer.getByText("Saved discussion comment", { exact: true })).toHaveCount(1);
  await check("comment", ["action"]);
  await drawer.getByLabel(t.admin.note, { exact: false }).fill("Administrator-only note");
  await drawer.getByRole("button", { name: t.admin.save, exact: true }).click();
  await expect(drawer.getByRole("button", { name: t.admin.save, exact: true })).toBeEnabled();
  await check("manage submission", ["action"]);
  await drawer.getByRole("button", { name: t.close, exact: true }).click();
  const row = page.locator("article").filter({ hasText: "Routing suggestion 1" });
  await row.getByRole("button", { name: "Supported · 1", exact: true }).click();
  await expect(row.getByRole("button", { name: "Support · 0", exact: true })).toBeEnabled();
  await check("row reaction", ["action"]);
  await row.getByRole("button", { name: t.workflow.accepted, exact: true }).click();
  await expect(row).toContainText(t.statuses.accepted); await check("row workflow", ["action"]);
  await openCreation(page, "submission"); await check("open creation", []);
  await page.goBack(); await expect(page.getByRole("dialog")).toHaveCount(0); await check("Back", []);
  await page.goForward(); await expect(page.getByRole("dialog")).toBeVisible(); await check("Forward", []);
  drawer = page.getByRole("dialog");
  await drawer.getByRole("radio", { name: t.types.suggestion, exact: true }).locator("..").click();
  await drawer.locator('[name="title"]').fill("Created routing suggestion");
  await drawer.locator('[name="description"]').fill("A new suggestion");
  await drawer.getByRole("button", { name: t.form.submit, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Created routing suggestion", exact: true })).toBeVisible();
  await check("create submission", ["action"]);
  await page.goto(`/office/submissions?item=${ids[1]}`);
  drawer = page.getByRole("dialog", { name: "Routing suggestion 1", exact: true });
  await expect(drawer.getByText("Saved discussion comment", { exact: true })).toHaveCount(1);
  await expect(drawer.getByLabel(t.admin.note, { exact: false })).toHaveValue("Administrator-only note");
  await check("direct URL", ["GET"]);
  // Reject a valid-looking stale support operation through the real database constraint.
  localSql(`insert into public.submission_reactions(submission_id,studio_id,user_id) values (${sqlId(ids[1])},${sqlId(studioId)},${sqlId(accounts[0].id)});`);
  await drawer.getByRole("button", { name: "Support · 0", exact: true }).click();
  await expect(drawer.getByRole("alert")).toBeVisible(); await check("failed reaction", ["action"]);
  const employeeContext = await browser.newContext();
  try {
    const employee = await employeeContext.newPage();
    await login(employee, accounts[1]);
    await employee.goto(`/office/submissions?item=${ids[1]}`);
    const employeeDrawer = employee.getByRole("dialog", { name: "Routing suggestion 1", exact: true });
    await expect(employeeDrawer).toBeVisible();
    await expect(employeeDrawer.getByText("Administrator-only note", { exact: true })).toHaveCount(0);
    await expect(employeeDrawer.getByRole("heading", { name: t.admin.title, exact: true })).toHaveCount(0);
  } finally { await employeeContext.close(); }
});

test("CRM lead writes reconcile once while keeping detail, history and form errors current", async ({ page }) => {
  const t = en.Crm;
  await login(page);
  const check = observeWorkspace(page, "/crm/leads");
  await page.goto("/crm/leads");
  await page.getByRole("button", { name: t.leads.add, exact: true }).click();
  await check("load leads", ["GET"]);
  let dialog = page.getByRole("dialog");
  await dialog.locator('[name="client_name"]').fill("Reconciliation lead");
  await dialog.locator('[name="email"]').fill("invalid-email");
  await dialog.getByRole("button", { name: t.save, exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await check("failed lead save", ["action"]);
  await dialog.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: t.leads.add, exact: true }).click();
  await dialog.locator('[name="client_name"]').fill("Reconciliation lead");
  await dialog.locator('[name="email"]').fill("lead@example.test");
  await dialog.getByRole("button", { name: t.save, exact: true }).click();
  await expect(page.getByRole("button", { name: "Open lead Reconciliation lead", exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0); await check("create lead", ["action"]);
  await page.getByRole("button", { name: "Open lead Reconciliation lead", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Reconciliation lead", exact: true });
  await choose(page, dialog, t.status.changeLabel, t.leadStatus.contacted);
  await expect(dialog.getByRole("combobox", { name: t.status.changeLabel, exact: true })).toBeEnabled();
  await expect(page.getByRole("row").filter({ hasText: "Reconciliation lead" })).toContainText(t.leadStatus.contacted);
  await check("lead status", ["action"]);
  await dialog.getByRole("button", { name: t.followUp.schedule, exact: true }).click();
  const followUp = page.getByRole("dialog", { name: t.followUp.scheduleTitle, exact: true });
  await followUp.getByRole("button", { name: t.followUp.quick.tomorrow, exact: true }).click();
  await followUp.getByRole("button", { name: t.followUp.scheduleAction, exact: true }).click();
  await expect(followUp).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: t.followUp.complete, exact: true })).toBeVisible();
  await check("schedule follow-up", ["action"]);
  await dialog.getByRole("button", { name: t.followUp.complete, exact: true }).click();
  await expect(dialog.getByRole("button", { name: t.followUp.schedule, exact: true })).toBeVisible();
  await check("complete follow-up", ["action"]);
  await dialog.getByRole("button", { name: t.history.action, exact: true }).click();
  await expect(dialog.getByText("Status changed from New to Contacted", { exact: true })).toBeVisible();
  await check("read history", ["action"]);
  await dialog.getByRole("button", { name: t.edit, exact: true }).click();
  await dialog.locator('[name="client_name"]').fill("Edited reconciliation lead");
  await dialog.getByRole("button", { name: t.save, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Open lead Edited reconciliation lead", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edited reconciliation lead", exact: true });
  await expect(dialog).toBeVisible(); await check("edit lead and reopen", ["action"]);
  await dialog.getByRole("button", { name: t.recordActions, exact: true }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: t.delete, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open lead Edited reconciliation lead", exact: true })).toHaveCount(0);
  await check("delete lead", ["action"]);
});

test("CRM candidate create, editor, new cycle and delete consume Server Action reconciliation", async ({ page }) => {
  const t = en.Crm;
  await login(page);
  const check = observeWorkspace(page, "/crm/candidates");
  await page.goto("/crm/candidates");
  await page.getByRole("button", { name: t.candidates.add, exact: true }).click();
  await check("load candidates", ["GET"]);
  let dialog = page.getByRole("dialog");
  await dialog.locator('[name="full_name"]').fill("Reconciliation candidate");
  await dialog.getByRole("button", { name: t.save, exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible(); await check("failed candidate create", ["action"]);
  await dialog.getByRole("button", { name: t.close, exact: true }).click();
  await page.getByRole("button", { name: t.candidates.add, exact: true }).click();
  await dialog.locator('[name="full_name"]').fill("Reconciliation candidate");
  await dialog.locator('[name="target_position"]').locator("..").getByRole("combobox").click();
  await page.getByRole("option").nth(1).click();
  await dialog.getByRole("button", { name: t.save, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Open candidate Reconciliation candidate", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Reconciliation candidate", exact: true });
  await expect(dialog).toBeVisible(); await check("create candidate", ["action"]);
  await dialog.getByRole("button", { name: t.edit, exact: true }).click();
  await dialog.locator('[name="full_name"]').fill("Edited reconciliation candidate");
  await dialog.locator('[name="outcome"]').locator("..").getByRole("combobox").click();
  await page.getByRole("option", { name: t.candidateOutcome.reserve, exact: true }).click();
  await dialog.getByRole("button", { name: t.save, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await choose(page, page.locator("main"), t.statusFilter, t.filters.all);
  await page.getByRole("button", { name: "Open candidate Edited reconciliation candidate", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edited reconciliation candidate", exact: true });
  await expect(dialog).toContainText(t.candidateOutcome.reserve); await check("edit candidate", ["action"]);
  await dialog.getByRole("button", { name: t.edit, exact: true }).click();
  const cycleForm = dialog.locator("form").filter({ has: page.getByRole("button", { name: t.candidates.startCycle, exact: true }) });
  await cycleForm.locator('[name="target_position"]').locator("..").getByRole("combobox").click();
  await page.getByRole("option").nth(1).click();
  await cycleForm.getByRole("button", { name: t.candidates.startCycle, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Open candidate Edited reconciliation candidate", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: t.candidates.history, exact: true })).toBeVisible();
  await expect(dialog).toContainText(t.candidateOutcome.reserve); await check("start cycle", ["action"]);
  await dialog.getByRole("button", { name: t.recordActions, exact: true }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: t.delete, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open candidate Edited reconciliation candidate", exact: true })).toHaveCount(0);
  await check("delete candidate", ["action"]);
});

test("Office creation navigates across workspaces and preserves anonymous and employee behavior", async ({ page, browser }) => {
  const t = en.Submissions;
  await login(page);
  await page.goto("/office/assignments");
  const check = observeWorkspace(page, "/office/submissions");
  await openCreation(page, "submission");
  await expect(page).toHaveURL(/\/office\/submissions\?create=submission/);
  await check("cross-workspace creation", ["GET"]);
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: t.types.complaint, exact: true }).locator("..").click();
  await dialog.locator('[name="anonymous"]').check();
  await dialog.locator('[name="title"]').fill("Private routing complaint");
  await dialog.locator('[name="description"]').fill("Anonymous discussion must remain unavailable");
  await page.mouse.click(1, 1);
  await expect(dialog.locator('[name="title"]')).toHaveValue("Private routing complaint");
  await dialog.getByRole("button", { name: t.form.submit, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(t.anonymousCreatedNotice, { exact: true })).toBeVisible();
  await check("anonymous creation", ["action"]);
  await page.getByRole("button", { name: "Complaint: Private routing complaint", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Private routing complaint", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(t.anonymousPrivate, { exact: true })).toBeVisible();
  await expect(dialog.getByLabel(t.comment, { exact: true })).toHaveCount(0);
  await check("anonymous detail", []);
  const directUrl = page.url();
  const employeeContext = await browser.newContext();
  try {
    const employee = await employeeContext.newPage();
    await login(employee, accounts[1]);
    await employee.goto(directUrl);
    await expect(employee.getByRole("heading", { name: t.title, exact: true })).toBeVisible();
    await expect(employee.getByRole("dialog")).toHaveCount(0);
    await expect(employee.getByRole("button", { name: "Complaint: Private routing complaint", exact: true })).toHaveCount(0);
    const employeeCheck = observeWorkspace(employee, "/office/submissions");
    await employee.getByRole("link", { name: en.Office.create, exact: true }).click();
    await expect(employee.getByRole("dialog", { name: t.form.title, exact: true })).toBeVisible();
    await employee.getByRole("dialog").getByRole("button", { name: t.close, exact: true }).click();
    await expect(employee.getByRole("dialog")).toHaveCount(0);
    await employeeCheck("employee creation open/close", []);
  } finally { await employeeContext.close(); }
});
