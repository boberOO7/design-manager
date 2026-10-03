import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID();
const projectId = randomUUID();
const orderProjectId = randomUUID();
const projectTemplateId = randomUUID();
const templateA = randomUUID();
const templateB = randomUUID();
const account = { id: "", email: `stage-editor-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` };
function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" });
}

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Stage editor browser" }).throwOnError();
  const user = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
  if (user.error) throw user.error;
  account.id = user.data.user.id;
  await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: "Stage editor admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: "admin", is_active: true }).throwOnError();
  sql(`insert into public.projects(id,studio_id,name,status,total_area_m2,start_date,created_by)
    values (${id(projectId)},${id(studioId)},'Stage editor browser project','active',500,current_date,${id(account.id)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
    values (${id(projectId)},${id(account.id)},'designer',0,current_date);
    insert into public.checklist_templates(id,studio_id,name,created_by) values
    (${id(templateA)},${id(studioId)},'Room checklist',${id(account.id)}),
    (${id(templateB)},${id(studioId)},'Changed checklist',${id(account.id)});
    insert into public.checklist_template_items(template_id,title,weight,position) values
    (${id(templateA)},'Measure',2,0),(${id(templateA)},'Draw',3,1),(${id(templateB)},'Inspect',4,0);
    insert into public.project_templates(id,studio_id,name,project_type,created_by)
    values (${id(projectTemplateId)},${id(studioId)},'Many rooms','private',${id(account.id)});
    insert into public.project_template_tasks(template_id,stage,title,position,checklist_template_id)
    select ${id(projectTemplateId)},'stage_1','Room ' || lpad(n::text,2,'0'),n-1,${id(templateA)} from generate_series(1,24) n;
    begin;
    select set_config('request.jwt.claim.sub',${id(account.id)},true);
    set local role authenticated;
    select public.apply_project_template_stage(${id(projectId)},${id(projectTemplateId)},'stage_1','stage_1',null);
    update public.tasks set description='Room structure',progress_weight=3,assignee_id=${id(account.id)},priority='urgent',status='in_progress'
      where project_id=${id(projectId)};
    update public.tasks set production_completion=42,manual_progress_override=true where project_id=${id(projectId)};
    update public.task_checklist_items set is_completed=true where task_id in (select id from public.tasks where project_id=${id(projectId)}) and position=0;
    commit;
    notify pgrst, 'reload schema';`);
  sql(`insert into public.projects(id,studio_id,name,status,total_area_m2,start_date,created_by)
    values (${id(orderProjectId)},${id(studioId)},'Ordered rooms','active',500,current_date,${id(account.id)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
    values (${id(orderProjectId)},${id(account.id)},'designer',0,current_date);
    begin;
    select set_config('request.jwt.claim.sub',${id(account.id)},true);
    set local role authenticated;
    select public.apply_project_template_stage(${id(orderProjectId)},${id(projectTemplateId)},'stage_1','stage_1',null);
    commit;`);
});

test.afterAll(async () => {
  sql(`delete from public.tasks where project_id in (${id(projectId)},${id(orderProjectId)});
    delete from public.project_members where project_id in (${id(projectId)},${id(orderProjectId)});
    delete from public.projects where id in (${id(projectId)},${id(orderProjectId)});
    delete from public.project_template_tasks where template_id=${id(projectTemplateId)};
    delete from public.project_templates where id=${id(projectTemplateId)};
    delete from public.checklist_template_items where template_id in (${id(templateA)},${id(templateB)});
    delete from public.checklist_templates where id in (${id(templateA)},${id(templateB)});
    delete from public.studios where id=${id(studioId)};`);
  if (account.id) {
    const result = await service.auth.admin.deleteUser(account.id);
    if (result.error) throw result.error;
  }
});

test("template order and two adjacent duplicates survive a Board reload", async ({ page }) => {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/projects/${orderProjectId}`);
  await page.getByRole("button", { name: "Configure columns", exact: true }).first().click();
  await page.getByRole("button", { name: en.StageTaskEditor.title, exact: true }).click();
  const editor = page.getByRole("dialog", { name: en.StageTaskEditor.title });
  const rows = editor.locator("[data-stage-task-row]");
  await expect(rows).toHaveCount(24);
  await expect(rows.nth(0).getByRole("textbox")).toHaveValue("Room 01");
  await expect(rows.nth(1).getByRole("textbox")).toHaveValue("Room 02");
  await rows.nth(0).getByRole("button", { name: "Duplicate task 1", exact: true }).click();
  await rows.nth(1).getByRole("textbox").fill("Room 01 copy A");
  await rows.nth(0).getByRole("button", { name: "Duplicate task 1", exact: true }).click();
  await rows.nth(2).getByRole("textbox").fill("Room 01 copy B");
  await expect(rows.nth(3).getByRole("textbox")).toHaveValue("Room 02");
  await editor.getByRole("button", { name: en.Tasks.saveChanges, exact: true }).click();
  await expect(editor).toHaveCount(0);

  await page.reload();
  const cards = page.locator('#project-stage-stage_1 [data-task-card]');
  await expect(cards).toHaveCount(26);
  for (const [index, title] of ["Room 01", "Room 01 copy A", "Room 01 copy B", "Room 02"].entries()) {
    await expect(cards.nth(index).locator("h4")).toHaveText(title);
  }
  const persisted = sql(`select string_agg(title,'|' order by stage_position) from public.tasks where project_id=${id(orderProjectId)} and stage='stage_1';`).trim().split("|");
  expect(persisted.slice(0, 4)).toEqual(["Room 01", "Room 01 copy A", "Room 01 copy B", "Room 02"]);
  await page.getByRole("button", { name: "Configure columns", exact: true }).first().click();
  await page.getByRole("button", { name: en.StageTaskEditor.title, exact: true }).click();
  const reopened = page.getByRole("dialog", { name: en.StageTaskEditor.title });
  for (const [index, title] of persisted.slice(0, 4).entries()) {
    await expect(reopened.locator("[data-stage-task-row]").nth(index).getByRole("textbox")).toHaveValue(title);
  }
});

test("edit many template tasks, duplicate, add/delete, and save once", async ({ page }) => {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "Configure columns", exact: true }).first().click();
  await page.getByRole("button", { name: en.StageTaskEditor.title, exact: true }).click();
  const editor = page.getByRole("dialog", { name: en.StageTaskEditor.title });
  const rows = editor.locator("[data-stage-task-row]");
  await expect(rows).toHaveCount(24);
  const names = await rows.locator('input[id^="stage-task-title-"]').evaluateAll((inputs) => inputs.map((input) => input instanceof HTMLInputElement ? input.value : ""));
  const first = rows.nth(0);
  await first.getByRole("spinbutton").fill("12.5");
  await first.getByRole("spinbutton").press("Enter");
  await expect(rows.nth(1).getByRole("spinbutton")).toBeFocused();
  await rows.nth(1).getByRole("spinbutton").fill("20");
  await rows.nth(1).getByRole("spinbutton").press("Enter");
  await expect(rows.nth(2).getByRole("spinbutton")).toBeFocused();
  await rows.nth(2).getByRole("spinbutton").fill("30");
  await rows.nth(1).getByRole("combobox").selectOption(templateB);
  await first.getByRole("button", { name: "Duplicate task 1", exact: true }).click();
  await expect(rows.nth(1).getByRole("textbox")).toBeFocused();
  await expect(rows.nth(1).getByRole("spinbutton")).toHaveValue("12.5");
  await rows.nth(1).getByRole("textbox").fill("Extra room");
  await rows.nth(1).getByRole("spinbutton").fill("15.5");
  await editor.getByRole("button", { name: en.Tasks.addTask, exact: true }).click();
  await rows.last().getByRole("textbox").fill("New room");
  await rows.last().getByRole("spinbutton").fill("8");
  await rows.last().getByRole("combobox").selectOption(templateB);
  const removedName = names[23];
  await rows.nth(24).getByRole("button", { name: "Delete task 25", exact: true }).click();
  await expect(rows.nth(24)).toContainText(en.StageTaskEditor.pendingDelete);
  await expect(editor.getByText("Tasks to delete when you save: 1.", { exact: true })).toBeVisible();

  // Read through the same authenticated role as the app; tasks are not service-role readable.
  const reader = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await reader.auth.signInWithPassword({ email: account.email, password: account.password });
  if (signedIn.error) throw signedIn.error;
  // Nothing persisted during editing.
  const before = await reader.from("tasks").select("id,completed_area_m2").eq("project_id", projectId).throwOnError();
  expect(before.data).toHaveLength(24);
  expect(before.data.every((task) => task.completed_area_m2 === null)).toBe(true);
  await editor.screenshot({ path: "test-results/stage-task-editor-before-save.png" });
  let saves = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.headers()["next-action"]) saves++; });
  await editor.getByRole("button", { name: en.Tasks.saveChanges, exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(saves).toBe(1);
  const { data: saved } = await reader.from("tasks").select("*,task_checklist_items(*),task_deadlines(*),task_collaborators(*)").eq("project_id", projectId).throwOnError();
  expect(saved).toHaveLength(25);
  expect(saved.find((task) => task.title === removedName)).toBeUndefined();
  expect(saved.find((task) => task.title === names[0])).toMatchObject({ completed_area_m2: 12.5, status: "in_progress", assignee_id: account.id, priority: "urgent", production_completion: 42, manual_progress_override: true });
  expect(saved.find((task) => task.title === names[1])).toMatchObject({ completed_area_m2: 20, checklist_template_id: templateB });
  expect(saved.find((task) => task.title === names[1])?.task_checklist_items.map((item) => item.title)).toEqual(["Inspect"]);
  expect(saved.find((task) => task.title === names[2])?.completed_area_m2).toBe(30);
  const duplicate = saved.find((task) => task.title === "Extra room");
  expect(duplicate).toMatchObject({ completed_area_m2: 15.5, status: "todo", assignee_id: null, priority: "normal", progress_weight: 3, description: "Room structure", checklist_template_id: templateA, production_completion: 0, manual_progress_override: false, completed_at: null, due_date: null, task_deadlines: [], task_collaborators: [] });
  expect(duplicate?.task_checklist_items).toHaveLength(2);
  expect(duplicate?.task_checklist_items.every((item) => !item.is_completed && !item.is_not_needed)).toBe(true);
  expect(saved.find((task) => task.title === "New room")).toMatchObject({ completed_area_m2: 8, checklist_template_id: templateB, status: "todo" });
  await page.reload();
  await expect(page.getByText("Extra room", { exact: true })).toBeVisible();
  await page.goto(`/projects/${projectId}?task=${duplicate?.id}`);
  const drawer = page.getByRole("dialog", { name: en.Tasks.taskDetails });
  await expect(drawer.getByText("Task area: 15.5 m²", { exact: true })).toBeVisible();
});
