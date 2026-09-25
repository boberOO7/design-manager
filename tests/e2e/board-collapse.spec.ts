import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import type { Database } from "../../src/types/database.types";

const settings = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(settings.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const service = createClient<Database>(settings.EQUIPMENT_TEST_SUPABASE_URL, settings.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studioId = randomUUID(); const projectId = randomUUID();
const smallProjectId = randomUUID();
const officeAssignmentId = randomUUID();
const completedOfficeAssignmentId = randomUUID();
const kyivToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const accounts = ["admin", "employee"].map((role) => ({ role, id: "", email: `board-ui-${randomUUID()}@example.test`, password: `Ui-${randomUUID()}` }));
function id(value: string) { return `'${z.uuid().parse(value)}'`; }
function sql(statement: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }); }
async function login(page: Page, index = 0) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.goto("/login"); await page.locator('input[type="email"]').fill(accounts[index].email); await page.locator('input[type="password"]').fill(accounts[index].password); await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}
test.beforeAll(async () => {
  await service.from("studios").insert({ id: studioId, name: "Board collapse browser" }).throwOnError();
  for (const account of accounts) {
    const user = await service.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true }); if (user.error) throw user.error;
    account.id = user.data.user.id; const role = account.role === "admin" ? "admin" : "employee";
    await service.from("profiles").upsert({ id: account.id, email: account.email, full_name: `Task ${role}`, system_role: role, is_active: true }).throwOnError();
    await service.from("studio_members").insert({ studio_id: studioId, user_id: account.id, system_role: role, is_active: true }).throwOnError();
  }
  sql(`insert into public.projects(id,studio_id,name,status,total_area_m2,start_date,created_by) values (${id(projectId)},${id(studioId)},'Large board','active',100,'2026-09-01',${id(accounts[0].id)});`);
  for (const account of accounts) sql(`insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values (${id(projectId)},${id(account.id)},'designer',0,'2026-09-01');`);
  sql(`insert into public.tasks(project_id,title,description,stage,status,priority,assignee_id,created_by,progress_weight)
    select ${id(projectId)},'Board '||stage||' task '||n,'Board description',stage,case when n%5=0 then 'completed' else 'todo' end,'normal',${id(accounts[0].id)},${id(accounts[0].id)},1
    from (values ('stage_1'),('stage_2'),('stage_3')) s(stage) cross join generate_series(1,60) n;
    insert into public.task_checklist_items(task_id,title,is_completed,weight,position) select id,'Item '||n,n%2=0,1,n from public.tasks cross join generate_series(1,5) n where project_id=${id(projectId)};`);
  sql(`insert into public.projects(id,studio_id,name,status,total_area_m2,start_date,created_by) values (${id(smallProjectId)},${id(studioId)},'Small board','active',100,'2026-09-01',${id(accounts[0].id)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) select ${id(smallProjectId)},user_id,project_role,assigned_area_m2,assigned_at from public.project_members where project_id=${id(projectId)};
    insert into public.tasks(project_id,title,stage,status,priority,assignee_id,created_by) select ${id(smallProjectId)},'Small task '||n,'stage_1','todo','normal',${id(accounts[0].id)},${id(accounts[0].id)} from generate_series(1,3) n;`);
  sql(`insert into public.task_deadlines(task_id,target_status,due_date)
    select id,'completed',('${kyivToday}'::date - 2) from public.tasks where project_id=${id(projectId)} and title='Board stage_3 task 1';
    insert into public.task_deadlines(task_id,target_status,due_date)
    select id,'completed','${kyivToday}'::date from public.tasks where project_id=${id(projectId)} and title='Board stage_3 task 2';
    insert into public.task_deadlines(task_id,target_status,due_date)
    select id,'completed',('${kyivToday}'::date + 2) from public.tasks where project_id=${id(projectId)} and title='Board stage_3 task 3';
    insert into public.task_deadlines(task_id,target_status,due_date)
    select id,'completed',('${kyivToday}'::date - 1) from public.tasks where project_id=${id(smallProjectId)} and title='Small task 1';
    insert into public.office_assignments(id,studio_id,creator_id,responsible_id,title,deadline)
    values (${id(officeAssignmentId)},${id(studioId)},${id(accounts[0].id)},${id(accounts[0].id)},'Urgent office',('${kyivToday}'::date - 3));
    insert into public.office_assignments(id,studio_id,creator_id,responsible_id,title,status,deadline)
    values (${id(completedOfficeAssignmentId)},${id(studioId)},${id(accounts[0].id)},${id(accounts[0].id)},'Finished office','done',('${kyivToday}'::date - 10));`);
});
test.afterAll(async () => {
  sql(`delete from public.tasks where project_id in (${id(projectId)},${id(smallProjectId)}); delete from public.project_members where project_id in (${id(projectId)},${id(smallProjectId)}); delete from public.projects where id in (${id(projectId)},${id(smallProjectId)}); delete from public.studios where id=${id(studioId)};`);
  for (const account of accounts) if (account.id) { const result = await service.auth.admin.deleteUser(account.id); if (result.error) throw result.error; }
});

function stageControl(page: Page, stage = 1) { return page.locator(`[aria-controls="project-stage-stage_${stage}"]`).first(); }
function stageContent(page: Page, stage = 1) { return page.locator(`#project-stage-stage_${stage}`); }
function column(page: Page, columnId: string, stage = 1) { return stageContent(page, stage).locator(`section[aria-labelledby="column-${columnId}"]`); }
function card(page: Page, title: string) { return page.locator('[data-task-card]').filter({ has: page.getByRole('heading', { name: title, exact: true }) }); }
async function sampleToggle(control: Locator) {
  return control.evaluate(async (button) => {
    const content = document.getElementById(button.getAttribute('aria-controls')!); if (!content || !(button instanceof HTMLElement)) throw Error('Missing stage');
    const frames: Array<{ time: number; height: number; cards: number }> = [];
    const start = performance.now(); button.click();
    await new Promise<void>((resolve) => {
      const sample = () => { frames.push({ time: performance.now() - start, height: content.getBoundingClientRect().height, cards: content.querySelectorAll('[data-task-card]').length }); if (performance.now() - start < 350) requestAnimationFrame(sample); else resolve(); };
      requestAnimationFrame(sample);
    });
    return frames;
  });
}

test('collapsed stage mount, animation, order, focus and network measurements', async ({ page }, testInfo) => {
  await login(page); await page.goto(`/projects/${projectId}`);
  const stage = stageContent(page); const control = stageControl(page);
  await expect(stage.locator('[data-task-card]')).toHaveCount(60);
  const order = await stage.locator('[data-task-card] h4').allTextContents();
  const header = stage.locator('..').locator(':scope > div').first();
  const headerText = await header.innerText();
  const progress = await page.getByRole('progressbar').evaluateAll((bars) => bars.map((bar) => bar.getAttribute('aria-valuenow')));
  const initialCounts = await page.locator('[id^="project-stage-stage_"]').evaluateAll((elements) => elements.map((element) => ({ id: element.id, cards: element.querySelectorAll('[data-task-card]').length, height: element.getBoundingClientRect().height })));
  const requests: string[] = [];
  page.on('request', (request) => { if (['fetch', 'xhr', 'document'].includes(request.resourceType()) && !request.headers()['next-router-prefetch']) requests.push(request.url()); });
  await stage.locator('[data-task-card]').first().focus();
  const frames = await sampleToggle(control);
  const collapsedCards = await page.locator('[data-task-card]').count();
  await testInfo.attach('mount-measurements', { body: JSON.stringify({ initialCounts, collapsedCards, frames }), contentType:'application/json' });
  console.log(JSON.stringify({ initialCounts, collapsedCards, intermediateFrames: frames.filter((frame) => frame.height > 1 && frame.height < (initialCounts[0]?.height ?? 0) - 1).length }));
  if (!process.env.BOARD_COLLAPSE_BASELINE) expect(collapsedCards).toBe(0);
  expect(frames.filter((frame) => frame.height > 1 && frame.height < initialCounts[0].height - 1).length).toBeGreaterThan(2);
  await expect(control).toBeFocused();
  expect(await header.innerText()).toBe(headerText);
  expect(await page.getByRole('progressbar').evaluateAll((bars) => bars.map((bar) => bar.getAttribute('aria-valuenow')))).toEqual(progress);
  const expansion = await sampleToggle(control);
  await testInfo.attach('expansion-frames', { body: JSON.stringify(expansion), contentType: 'application/json' });
  expect(expansion.filter((frame) => frame.height > 1 && frame.height < initialCounts[0].height - 1).length).toBeGreaterThan(2);
  expect(await stage.locator('[data-task-card] h4').allTextContents()).toEqual(order);
  // Reverse an in-flight collapse; the stale completion must not unmount reopened cards.
  await control.evaluate(async (button) => { if (!(button instanceof HTMLElement)) throw Error('Missing control'); button.click(); await new Promise((resolve) => setTimeout(resolve, 65)); button.click(); });
  await expect(control).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => stage.evaluate((node) => node.getAnimations().length)).toBe(0);
  await expect(stage.locator('[data-task-card]')).toHaveCount(60);
  for (const number of [2, 3]) {
    await stageControl(page, number).click();
    await expect(stageContent(page, number).locator('[data-task-card]')).toHaveCount(60);
    await stageControl(page, number).click();
    await expect(stageContent(page, number).locator('[data-task-card]')).toHaveCount(0);
  }
  expect(requests).toEqual([]);
});

test('My Tasks inbox aligns metadata, styles filters, and switches task states', async ({ page }) => {
  await login(page);
  await page.goto('/my-tasks');
  const large = page.locator(`[data-inbox-group="${projectId}"]`);
  const small = page.locator(`[data-inbox-group="${smallProjectId}"]`);
  const office = page.locator('[data-inbox-group="office"]');
  await expect(page.locator('[data-inbox-group]')).toHaveCount(3);
  expect(await page.locator('[data-inbox-group]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-inbox-group')))).toEqual(['office', projectId, smallProjectId]);
  await expect(large.getByRole('button', { name: 'Collapse or expand Large board' })).toContainText('144');
  await expect(large.getByRole('button', { name: '139 more' })).toBeVisible();
  await large.getByRole('button', { name: '139 more' }).click();
  await expect(large.getByRole('button', { name: /^Open task/ })).toHaveCount(144);
  const overdueRow = large.getByRole('button', { name: 'Open task Board stage_3 task 1', exact: true });
  const undatedRow = large.getByRole('button', { name: 'Open task Board stage_3 task 4', exact: true });
  const [overdueDeadline, undatedDeadline, overdueStage, undatedStage, overdueStatus, undatedStatus] = await Promise.all([
    overdueRow.locator('[data-inbox-deadline]').boundingBox(), undatedRow.locator('[data-inbox-deadline]').boundingBox(),
    overdueRow.locator('[data-inbox-stage]').boundingBox(), undatedRow.locator('[data-inbox-stage]').boundingBox(),
    overdueRow.locator('[data-inbox-status]').boundingBox(), undatedRow.locator('[data-inbox-status]').boundingBox(),
  ]);
  if (!overdueDeadline || !undatedDeadline || !overdueStage || !undatedStage || !overdueStatus || !undatedStatus) throw Error('Missing inbox metadata');
  expect(overdueDeadline.x).toBeLessThan(undatedDeadline.x);
  expect(overdueDeadline.x + overdueDeadline.width).toBeLessThan(overdueStage.x);
  expect(overdueStage.x).toBeLessThan(overdueStatus.x);
  expect(Math.abs(overdueStage.x - undatedStage.x)).toBeLessThan(1);
  expect(Math.abs(overdueStatus.x - undatedStatus.x)).toBeLessThan(1);
  await large.getByRole('button', { name: 'Show less' }).click();
  await expect(large.getByRole('button', { name: /^Open task/ })).toHaveCount(5);
  await large.getByRole('button', { name: 'Collapse or expand Large board' }).click();
  await expect(large.getByRole('button', { name: /^Open task/ })).toHaveCount(0);
  await large.getByRole('button', { name: 'Collapse or expand Large board' }).click();

  const taskState = page.getByRole('group', { name: 'Task state' });
  await taskState.getByRole('button', { name: 'Completed' }).click();
  await expect(page.locator('[data-inbox-group]')).toHaveCount(2);
  await expect(large.getByRole('button', { name: 'Collapse or expand Large board' })).toContainText('36');
  await expect(office.getByRole('link', { name: /Finished office/ })).toBeVisible();
  await taskState.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('[data-inbox-group]')).toHaveCount(3);
  await expect(large.getByRole('button', { name: 'Collapse or expand Large board' })).toContainText('180');
  await expect(large.getByRole('button', { name: '175 more' })).toBeVisible();
  await taskState.getByRole('button', { name: 'Active' }).click();
  await expect(large.getByRole('button', { name: 'Collapse or expand Large board' })).toContainText('144');

  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'Overdue', exact: true }).click();
  await expect(page.locator('[data-inbox-group]')).toHaveCount(3);
  await expect(large.getByRole('button', { name: /^Open task/ })).toHaveCount(1);
  await expect(large.getByRole('button', { name: /more$/ })).toHaveCount(0);
  await expect(small.getByRole('button', { name: /^Open task/ })).toHaveCount(1);
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('[data-inbox-group]')).toHaveCount(1);
  await expect(large.getByRole('button', { name: /^Open task/ })).toHaveCount(1);
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: '7 days', exact: true }).click();
  await expect(page.locator('[data-inbox-group]')).toHaveCount(1);
  await expect(large.getByRole('button', { name: /^Open task/ })).toHaveCount(2);
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search by title' }).fill('Urgent office');
  await expect(page.locator('[data-inbox-group]')).toHaveCount(1);
  await expect(office).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search by title' }).fill('');
  const projectFilter = page.getByRole('combobox', { name: 'Project', exact: true });
  const typeFilter = page.getByRole('combobox', { name: 'Type', exact: true });
  expect(await projectFilter.evaluate((element) => element.tagName)).toBe('BUTTON');
  expect(await typeFilter.evaluate((element) => element.tagName)).toBe('BUTTON');
  await projectFilter.click();
  await page.getByRole('option', { name: 'Large board' }).click();
  await expect(page.locator('[data-inbox-group]')).toHaveCount(1);
  await expect(large).toBeVisible();
  await projectFilter.click();
  await page.getByRole('option', { name: 'All groups' }).click();
  await typeFilter.click();
  await page.getByRole('option', { name: 'Office assignments' }).click();
  await expect(page.locator('[data-inbox-group]')).toHaveCount(1);
  await office.getByRole('link', { name: /Urgent office/ }).click();
  await expect(page).toHaveURL(new RegExp(`office/assignments\\?item=${officeAssignmentId}`));
  await expect(page.getByRole('dialog', { name: 'Urgent office' })).toBeVisible();

  await page.goto('/my-tasks');
  const taskTitle = 'Board stage_3 task 1';
  const taskId = sql(`select id from public.tasks where project_id=${id(projectId)} and title='Board stage_3 task 1';`).trim();
  await large.getByRole('button', { name: en.Tasks.openTask.replace('{name}', taskTitle), exact: true }).click();
  await expect(page).toHaveURL('/my-tasks');
  let drawer = page.getByRole('dialog', { name: en.Tasks.taskDetails });
  await expect(drawer.getByRole('heading', { name: taskTitle, exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: en.Tasks.closeTaskDetails }).click();
  await expect(drawer).toHaveCount(0);
  await large.getByRole('button', { name: en.Tasks.openTask.replace('{name}', taskTitle), exact: true }).locator('..').getByRole('link', { name: en.Tasks.goToProject }).click();
  await expect(page).toHaveURL(`/projects/${projectId}?task=${taskId}`);
  drawer = page.getByRole('dialog', { name: en.Tasks.taskDetails });
  await expect(drawer.getByRole('heading', { name: taskTitle, exact: true })).toBeVisible();
});

test('selection, bulk move, pointer and keyboard drag, and drawer survive remounting', async ({ page }) => {
  await login(page); await page.goto(`/projects/${projectId}`);
  await sampleToggle(stageControl(page)); await sampleToggle(stageControl(page));
  const first = card(page, 'Board stage_1 task 1'); const second = card(page, 'Board stage_1 task 2');
  await first.click({ modifiers: ['Control'] }); await second.click({ modifiers: ['Control'] });
  await expect(stageContent(page).locator('[data-task-card][aria-pressed="true"]')).toHaveCount(2);
  await sampleToggle(stageControl(page)); await sampleToggle(stageControl(page));
  await expect(stageContent(page).locator('[data-task-card][aria-pressed="true"]')).toHaveCount(0);
  await first.click({ modifiers: ['Control'] }); await second.click({ modifiers: ['Control'] });
  await first.click({ button: 'right' });
  const menu = page.locator('[data-bulk-menu]');
  await menu.getByRole('button', { name: 'Move to…', exact: true }).click();
  await menu.getByRole('button', { name: en.Status.inProgress, exact: true }).click();
  await expect(column(page, 'in-progress').locator('[data-task-card]')).toHaveCount(2);
  await expect.poll(() => sql(`select count(*) from public.tasks where project_id=${id(projectId)} and title in ('Board stage_1 task 1','Board stage_1 task 2') and status='in_progress';`).trim()).toBe('2');
  await expect(stageContent(page).locator('[data-task-card][aria-pressed="true"]')).toHaveCount(0);

  const third = card(page, 'Board stage_1 task 3');
  await third.scrollIntoViewIfNeeded();
  const box = await third.boundingBox(); if (!box) throw Error('Missing card');
  const target = await column(page, 'in-progress').boundingBox(); if (!target) throw Error('Missing column');
  await page.mouse.move(box.x + box.width / 2, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + 20, { steps: 6 });
  await expect(third).toHaveClass(/opacity-30/);
  await page.mouse.move(target.x + target.width / 2, box.y + 20, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => sql(`select status from public.tasks where project_id=${id(projectId)} and title='Board stage_1 task 3';`).trim()).toBe('in_progress');

  const fourth = card(page, 'Board stage_1 task 4');
  await fourth.focus(); await page.keyboard.press('Space'); await expect(fourth).toHaveClass(/opacity-30/);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
  await expect.poll(() => sql(`select status from public.tasks where project_id=${id(projectId)} and title='Board stage_1 task 4';`).trim()).toBe('in_progress');

  await sampleToggle(stageControl(page)); await sampleToggle(stageControl(page));
  await first.click(); const drawer = page.getByRole('dialog', { name: en.Tasks.taskDetails });
  await expect(drawer.getByText('Board description', { exact: true })).toBeVisible();
  await expect(drawer.getByText(en.Status.inProgress, { exact: true }).first()).toBeVisible();
  await drawer.getByRole('button', { name: en.Tasks.closeTaskDetails }).click(); await expect(drawer).toHaveCount(0);
  await first.click(); await expect(drawer.getByText('Board description', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: en.Tasks.closeTaskDetails }).click();
});

test('collapsing during a selected-task drag retains its source until cancellation', async ({ page }) => {
  await login(page); await page.goto(`/projects/${projectId}`);
  const first = card(page, 'Board stage_1 task 6'); const second = card(page, 'Board stage_1 task 7');
  await first.click({ modifiers: ['Control'] }); await second.click({ modifiers: ['Control'] });
  await first.focus(); await page.keyboard.press('Space'); await expect(first).toHaveClass(/opacity-30/);
  await sampleToggle(stageControl(page));
  await expect(stageContent(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(stageContent(page).locator('[data-task-card]')).toHaveCount(60);
  await page.keyboard.press('Escape');
  await expect(stageContent(page).locator('[data-task-card]')).toHaveCount(0);
  await sampleToggle(stageControl(page));
  await expect(stageContent(page).locator('[data-task-card][aria-pressed="true"]')).toHaveCount(0);
  expect(sql(`select count(*) from public.tasks where project_id=${id(projectId)} and title in ('Board stage_1 task 6','Board stage_1 task 7') and status='todo';`).trim()).toBe('2');
  // A drop whose target was collapsed mid-drag must also leave persistence untouched.
  await first.focus(); await page.keyboard.press('Space'); await expect(first).toHaveClass(/opacity-30/);
  await page.keyboard.press('ArrowRight'); await sampleToggle(stageControl(page));
  await page.keyboard.press('Space');
  await expect(stageContent(page).locator('[data-task-card]')).toHaveCount(0);
  expect(sql(`select status from public.tasks where project_id=${id(projectId)} and title='Board stage_1 task 6';`).trim()).toBe('todo');
  await sampleToggle(stageControl(page));
  await expect(first).toBeVisible();
});

test('small board honors reduced motion, keyboard toggles, and read-only permissions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 1); await page.goto(`/projects/${smallProjectId}`);
  const stage = stageContent(page); const control = stageControl(page);
  await expect(stage.locator('[data-task-card]')).toHaveCount(3);
  await expect(stage.locator('[data-task-card]').first()).not.toHaveAttribute('aria-roledescription', 'draggable');
  await control.focus(); await page.keyboard.press('Enter');
  await expect(stage.locator('[data-task-card]')).toHaveCount(0);
  expect(await stage.evaluate((node) => getComputedStyle(node).transitionProperty)).toBe('none');
  await page.keyboard.press('Enter'); await expect(stage.locator('[data-task-card]')).toHaveCount(3);
  await stage.locator('[data-task-card]').first().click();
  const drawer = page.getByRole('dialog', { name: en.Tasks.taskDetails });
  await expect(drawer).toBeVisible(); await expect(drawer.getByRole('combobox')).toHaveCount(0);
  await drawer.getByRole('button', { name: en.Tasks.closeTaskDetails }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { document.documentElement.dataset.motion = 'off'; });
  const height = await stage.evaluate((node) => node.getBoundingClientRect().height);
  const frames = await sampleToggle(control);
  await expect(stage.locator('[data-task-card]')).toHaveCount(0);
  expect(frames.filter((frame) => frame.height > 1 && frame.height < height - 1)).toHaveLength(0);
});

test('paused, completed and archived projects retain their task and permission rules after expansion', async ({ page }) => {
  sql(`update public.tasks set status=case when title='Small task 1' then 'cancelled' else 'completed' end where project_id=${id(smallProjectId)};
    update public.projects set status='paused' where id=${id(smallProjectId)};`);
  await login(page);
  for (const status of ['paused', 'completed', 'archived']) {
    if (status !== 'paused') sql(`update public.projects set status='${status}',completed_at=now(),archived_at=${status === 'archived' ? 'now()' : 'null'} where id=${id(smallProjectId)};`);
    await page.goto(`/projects/${smallProjectId}`);
    const control = stageControl(page); const stage = stageContent(page);
    await expect(column(page, 'done').locator('[data-task-card]')).toHaveCount(3);
    const headerText = await stage.locator('..').locator(':scope > div').first().innerText();
    await sampleToggle(control); await expect(stage.locator('[data-task-card]')).toHaveCount(0);
    expect(await stage.locator('..').locator(':scope > div').first().innerText()).toBe(headerText);
    await sampleToggle(control); await expect(column(page, 'done').locator('[data-task-card]')).toHaveCount(3);
    if (status === 'paused') await expect(stage.locator('[data-task-card]').first()).toHaveClass(/cursor-grab/);
    else await expect(stage.locator('[data-task-card]').first()).not.toHaveClass(/cursor-grab/);
    await expect(card(page, 'Small task 1').getByText(en.Status.cancelled, { exact: true })).toBeVisible();
  }
});
