import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../helpers/task-review-fixture";
import { reviewTimerSnapshotSchema } from "../../src/lib/review-timer";
import uk from "../../messages/uk.json";

let fixture: TaskReviewFixture;
test.beforeAll(async () => { fixture = await createTaskReviewFixture(); });
test.afterAll(async () => { if (fixture) await fixture.dispose(); });

async function login(page: Page, account: TaskReviewFixture["admin"]) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return form && Object.keys(form).some(key => key.startsWith("__reactProps") && typeof Object.getOwnPropertyDescriptor(form, key)?.value?.onSubmit === "function");
  });
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("assigns and edits existing Internal Review tasks, notifies only active steps, and starts one selected session", async ({ page, browser }) => {
  const { admin, assignee, reviewer, projectId, taskId } = fixture;
  // An ordinary Internal Review task can predate the reviewer/round workflow.
  await assignee.client.from("tasks").update({ status: "internal_review" }).eq("id", taskId).throwOnError();
  expect((await admin.client.from("task_review_rounds").select("id").eq("task_id", taskId).throwOnError()).data).toEqual([]);
  const notifications = async () => (await Promise.all([reviewer, assignee, admin].map(account => account.client.from("notifications")
    .select("recipient_id,created_at").eq("entity_id", taskId).eq("notification_type", "task_review_requested").throwOnError())))
    .flatMap(result => result.data).sort((left, right) => left.created_at.localeCompare(right.created_at)).map(row => row.recipient_id);
  await login(page, admin);
  await page.goto(`/projects/${projectId}?task=${taskId}`);
  const initialDrawer = page.getByRole("dialog", { name: uk.Tasks.taskDetails });
  const initialSettings = initialDrawer.locator('section[aria-labelledby="task-review-title"]');
  await initialDrawer.getByRole("button", { name: uk.Tasks.editTask, exact: true }).click();
  await expect(initialSettings.getByRole("combobox", { name: uk.Tasks.reviewAddReviewer, exact: true })).toBeEnabled();
  for (const name of ["Review Reviewer", "Review Admin"]) {
    await initialSettings.getByRole("combobox", { name: uk.Tasks.reviewAddReviewer, exact: true }).click();
    await initialDrawer.getByRole("option", { name, exact: true }).click();
  }
  const assigned = page.waitForResponse(response => response.url().endsWith(`/api/tasks/${taskId}`) && response.request().method() === "PATCH");
  await initialDrawer.getByRole("button", { name: uk.Tasks.saveChanges, exact: true }).click();
  expect((await assigned).ok()).toBe(true);
  await expect(initialDrawer.locator("header")).toContainText(uk.Status.internal_review);
  expect(await notifications()).toEqual([reviewer.id]);
  const first = (await admin.client.from("task_review_rounds").select("id").eq("task_id", taskId).single().throwOnError()).data;
  const originalSession = randomUUID();
  await reviewer.client.rpc("control_review_timer", { p_action: "start", p_session_id: originalSession, p_round_ids: [first.id] }).throwOnError();
  reviewSql(`update public.review_timer_sessions set accounted_at=clock_timestamp()-interval '2 minutes' where id=${sqlId(originalSession)};`);
  const otherRounds: string[] = [];
  for (const title of ["Selection included", "Selection excluded"]) {
    const id = randomUUID();
    reviewSql(`insert into public.tasks(id,project_id,title,stage,status,assignee_id,created_by)
      values (${sqlId(id)},${sqlId(projectId)},'${title}','stage_1','in_progress',${sqlId(assignee.id)},${sqlId(admin.id)});`);
    await admin.client.rpc("update_task_review", { p_task_id: id, p_action: "configure", p_reviewer_ids: [assignee.id] }).throwOnError();
    await assignee.client.rpc("update_task_review", { p_task_id: id, p_action: "submit" }).throwOnError();
    otherRounds.push((await admin.client.from("task_review_rounds").select("id").eq("task_id", id).single().throwOnError()).data.id);
  }
  await page.goto("/my-tasks?view=review");
  await expect(page.getByText(uk.Tasks.reviewQueueEmpty)).toBeVisible();
  await page.goto(`/projects/${projectId}?task=${taskId}`);
  const drawer = page.getByRole("dialog", { name: uk.Tasks.taskDetails });
  const settings = drawer.locator('section[aria-labelledby="task-review-title"]');
  await drawer.getByRole("button", { name: uk.Tasks.editTask, exact: true }).click();
  await expect(settings.getByRole("combobox", { name: uk.Tasks.reviewSequenceReviewer.replace("{number}", "1"), exact: true })).toBeEnabled();
  await settings.getByRole("combobox", { name: uk.Tasks.reviewSequenceReviewer.replace("{number}", "1"), exact: true }).click();
  await drawer.getByRole("option", { name: "Review Assignee", exact: true }).click();
  const reassigned = page.waitForResponse(response => response.url().endsWith(`/api/tasks/${taskId}`) && response.request().method() === "PATCH");
  await drawer.getByRole("button", { name: uk.Tasks.saveChanges, exact: true }).click();
  expect((await reassigned).ok()).toBe(true);
  expect(await notifications()).toEqual([reviewer.id, assignee.id]);
  await expect(drawer.locator("header")).toContainText(uk.Status.internal_review);
  await expect(settings).toContainText("Review Assignee");
  expect((await admin.client.from("task_review_rounds").select("id,reviewer_id,completed_at").eq("task_id", taskId).single().throwOnError()).data).toEqual({ id: first.id, reviewer_id: assignee.id, completed_at: null });
  expect((await admin.client.from("review_timer_sessions").select("state").eq("id", originalSession).single().throwOnError()).data.state).toBe("completed");
  expect((await fixture.service.from("work_log_entries").select("user_id,minutes").eq("review_round_id", first.id).single().throwOnError()).data).toEqual({ user_id: reviewer.id, minutes: 2 });
  await drawer.getByRole("button", { name: uk.Tasks.closeTaskDetails, exact: true }).click();
  await expect(drawer).toHaveCount(0);

  const workerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const worker = await workerContext.newPage();
    await login(worker, assignee);
    await worker.goto("/my-tasks?view=review");
    await worker.getByRole("button", { name: /^Сповіщення,/ }).click();
    const workerNotifications = worker.getByRole("dialog", { name: uk.Notifications.title, exact: true });
    await expect(workerNotifications.getByText(uk.Notifications.taskReviewRequestedTitle, { exact: true })).toBeVisible();
    await workerNotifications.getByRole("button", { name: uk.Notifications.close, exact: true }).click();
    const group = worker.locator("[data-review-group]");
    await expect(group.locator("[data-review-group-toggle]")).toHaveAttribute("aria-expanded", "false");
    await expect(group.getByRole("button", { name: uk.ReviewTimer.startGroup, exact: true })).toBeVisible();
    await group.locator("[data-review-group-toggle]").click();
    const row = (id: string) => worker.locator(`[data-review-row="${id}"]`);
    await row(first.id).locator("[data-review-open]").click({ modifiers: ["Control"] });
    await row(otherRounds[0]).locator("[data-review-open]").click({ modifiers: ["Meta"] });
    const toolbar = worker.locator("[data-review-selection-toolbar]");
    await expect(toolbar).toContainText(uk.ReviewTimer.selectedCount.replace("{count}", "2"));
    await expect(worker.getByRole("dialog", { name: uk.Tasks.taskDetails })).toHaveCount(0);
    await toolbar.getByRole("button", { name: uk.ReviewTimer.clearSelection, exact: true }).click();
    await expect(toolbar).toHaveCount(0);
    await row(first.id).locator("[data-review-open]").click({ modifiers: ["Control"] });
    await row(otherRounds[0]).locator("[data-review-open]").click({ modifiers: ["Meta"] });
    await expect(row(otherRounds[1])).toHaveAttribute("data-review-selected", "false");
    const started = worker.waitForResponse(response => response.url().endsWith("/api/review-timers") && response.request().method() === "POST");
    await toolbar.getByRole("button", { name: uk.ReviewTimer.start, exact: true }).click();
    const response = await started;
    expect(response.ok()).toBe(true);
    const snapshot = reviewTimerSnapshotSchema.parse(await response.json());
    const active = snapshot.sessions.filter(session => session.user_id === assignee.id && session.state === "active");
    expect(active).toHaveLength(1);
    expect(active[0].members.map(member => member.round_id).sort()).toEqual([first.id, otherRounds[0]].sort());
    await expect(toolbar).toHaveCount(0);
    await expect(row(otherRounds[1])).toContainText(uk.ReviewTimer.waiting);
    expect((await worker.request.post("/api/review-timers", { data: { action: "pause", sessionId: active[0].id } })).ok()).toBe(true);
    // The admin was a future reviewer throughout assignment/reassignment.
    await page.getByRole("button", { name: /^Сповіщення,/ }).click();
    const adminNotifications = page.getByRole("dialog", { name: uk.Notifications.title, exact: true });
    await expect(adminNotifications.getByText(uk.Notifications.taskReviewRequestedTitle, { exact: true })).toHaveCount(0);
    await row(first.id).getByRole("button", { name: uk.Tasks.reviewApprove, exact: true }).click();
    await expect(adminNotifications.getByText(uk.Notifications.taskReviewRequestedTitle, { exact: true })).toBeVisible();
    expect(await notifications()).toEqual([reviewer.id, assignee.id, admin.id]);
    await adminNotifications.getByRole("button", { name: uk.Notifications.close, exact: true }).click();
    await page.goto("/my-tasks?view=review");
    await expect(page.locator(`[data-review-row="${first.id}"]`)).toBeVisible();
    await expect(worker.locator(`[data-review-row="${first.id}"]`)).toHaveCount(0);
  } finally { await workerContext.close(); }
});
