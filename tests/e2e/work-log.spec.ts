import { expect, test, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../helpers/task-review-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import { dailyWorkLogSchema, workLogDayBounds } from "../../src/lib/work-log";
import { instantToDateOnly } from "../../src/lib/calendar";
import uk from "../../messages/uk.json";

let fixture: TaskReviewFixture;

async function chooseDuration(log: Locator, row: Locator, hours: string, minutes: string) {
  const trigger = row.locator("[data-work-log-duration]");
  await trigger.click();
  await log.getByRole("listbox", { name: "Години", exact: true }).getByRole("option", { name: hours, exact: true }).click();
  await log.getByRole("listbox", { name: "Хвилини", exact: true }).getByRole("option", { name: minutes, exact: true }).click();
  await trigger.click();
}
test.beforeEach(async () => { fixture = await createTaskReviewFixture(); });
test.afterEach(async () => {
  if (!fixture) return;
  reviewSql(`delete from public.calendar_events where studio_id=${sqlId(fixture.studioId)};`);
  await fixture.dispose();
});

test("manual work defaults to personal tasks, searches other studio tasks, and keeps the date visible", async ({ page }) => {
  const { admin, assignee, reviewer, projectId } = fixture;
  const ownId = randomUUID(), collaboratorId = randomUUID(), otherId = randomUUID();
  reviewSql(`insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values
    (${sqlId(ownId)},${sqlId(projectId)},'Manual assigned work','stage_1','todo','normal',${sqlId(reviewer.id)},${sqlId(admin.id)}),
    (${sqlId(collaboratorId)},${sqlId(projectId)},'Manual collaborating work','stage_1','todo','normal',${sqlId(assignee.id)},${sqlId(admin.id)}),
    (${sqlId(otherId)},${sqlId(projectId)},'Manual colleague work','stage_1','todo','normal',${sqlId(assignee.id)},${sqlId(admin.id)});
    insert into public.task_collaborators(task_id,user_id) values (${sqlId(collaboratorId)},${sqlId(reviewer.id)});`);
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://localhost:3000" }]);
  await signInLocalTestUser(page, reviewer);
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  const log = page.getByRole("dialog", { name: uk.WorkLog.title });
  const add = log.getByRole("button", { name: uk.WorkLog.addWork, exact: true });
  const picker = log.getByRole("combobox", { name: uk.WorkLog.chooseWork, exact: true });
  await add.click();
  await expect(picker).toHaveText(uk.WorkLog.chooseWork);
  await picker.click();
  await expect(log.getByRole("option", { name: /Manual assigned work/ })).toBeVisible();
  await expect(log.getByRole("option", { name: /Manual collaborating work/ })).toBeVisible();
  await expect(log.getByRole("option", { name: /Manual colleague work/ })).toHaveCount(0);
  await log.getByRole("option", { name: /Manual assigned work/ }).click();
  const ownRow = log.locator(`[data-work-log-row="task:${ownId}"]`);
  await expect(ownRow).toBeVisible();
  const zeroColor = await ownRow.locator("[data-work-log-duration]").evaluate(element => getComputedStyle(element).color);
  await chooseDuration(log, ownRow, "00", "10");
  const filledColor = await ownRow.locator("[data-work-log-duration]").evaluate(element => getComputedStyle(element).color);
  expect(filledColor).not.toBe(zeroColor);

  await add.click();
  await picker.click();
  await expect(log.getByRole("option", { name: /Manual assigned work/ })).toHaveCount(0);
  await log.getByRole("option", { name: /Manual collaborating work/ }).click();
  await add.click();
  await log.getByRole("button", { name: uk.WorkLog.otherStudioTasks, exact: true }).click();
  await picker.click();
  const search = log.getByRole("combobox", { name: uk.WorkLog.searchWork, exact: true });
  await search.fill("does-not-exist");
  await expect(log.getByRole("status")).toHaveText(uk.WorkLog.noSearchResults);
  await search.fill("Manual colleague");
  await expect(log.getByRole("option")).toHaveCount(1);
  await log.getByRole("option", { name: /Manual colleague work/ }).click();
  await expect(log.locator(`[data-work-log-row="task:${otherId}"]`)).toBeVisible();
  await add.click();
  await expect(log.getByRole("button", { name: uk.WorkLog.yourWork, exact: true })).toHaveCount(0);
  await expect(log.getByRole("button", { name: uk.WorkLog.otherStudioTasks, exact: true })).toBeVisible();
  await add.click();

  const date = log.getByLabel(uk.WorkLog.date, { exact: true });
  const originalDatePosition = await date.boundingBox();
  if (!originalDatePosition) throw new Error("Date must be visible");
  const scrolled = await log.locator("[data-work-log-scroll]").evaluate(element => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  await expect(date).toBeInViewport();
  expect((await date.boundingBox())?.y).toBe(originalDatePosition.y);
  await log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click();
  await expect(log).toHaveCount(0);
  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  await expect(ownRow.locator("[data-work-log-duration]")).toHaveText("00:10");
  const saved = await reviewer.client.from("work_log_entries").select("minutes").eq("task_id", ownId).eq("user_id", reviewer.id).throwOnError();
  expect(saved.data).toEqual([{ minutes: 10 }]);
});

test("today's task/review interaction → suggested rows → save → reopen/edit with Calendar total", async ({ page }) => {
  const { admin, assignee, reviewer, taskId, fallbackTaskId, projectId } = fixture;
  await admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "configure", p_reviewer_ids: [reviewer.id] }).throwOnError();
  await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
  await admin.client.from("tasks").update({ assignee_id: reviewer.id }).eq("id", fallbackTaskId).throwOnError();
  reviewSql(`insert into public.task_checklist_items(task_id,title,position) values (${sqlId(fallbackTaskId)},'Work log checklist interaction',0);`);
  const { start } = workLogDayBounds(instantToDateOnly(new Date().toISOString()));
  await reviewer.client.rpc("create_calendar_event_with_invites", { p_studio_id: fixture.studioId,
    p_title: "Work log Calendar context", p_event_type: "meeting", p_starts_at: start,
    p_ends_at: new Date(Date.parse(start) + 45 * 60_000).toISOString(), p_all_day: false,
    p_meeting_mode: "online" }).throwOnError();
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://localhost:3000" }]);
  await signInLocalTestUser(page, reviewer);

  await page.goto(`/projects/${projectId}?task=${fallbackTaskId}`);
  const drawer = page.getByRole("dialog", { name: uk.Tasks.taskDetails });
  const checkbox = drawer.getByRole("checkbox");
  const checklistSaved = page.waitForResponse(response => response.url().includes("/checklist/") && response.request().method() === "PATCH");
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  expect((await checklistSaved).ok()).toBe(true);
  await drawer.getByRole("button", { name: uk.Tasks.closeTaskDetails }).click();
  await page.goto(`/projects/${projectId}?task=${taskId}`);
  await drawer.getByRole("button", { name: uk.Tasks.reviewApprove }).click();
  await expect(drawer.locator("header")).toContainText(uk.Status.review);
  await drawer.getByRole("button", { name: uk.Tasks.closeTaskDetails }).click();

  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  const log = page.getByRole("dialog", { name: uk.WorkLog.title });
  const taskRow = log.locator(`[data-work-log-row="task:${fallbackTaskId}"]`);
  const reviewRow = log.locator('[data-work-log-row^="review:"]');
  await expect(taskRow).toBeVisible();
  await expect(reviewRow).toContainText("Review #1");
  await expect(log.getByRole("region", { name: uk.WorkLog.tasks, exact: true }).locator(`[data-work-log-row="task:${fallbackTaskId}"]`)).toBeVisible();
  await expect(log.getByRole("region", { name: uk.WorkLog.reviews, exact: true })).toContainText("Review #1");
  await chooseDuration(log, taskRow, "01", "30");
  await chooseDuration(log, reviewRow, "00", "30");
  const calendar = await page.request.get(`/api/work-log?date=${await log.getByLabel(uk.WorkLog.date).inputValue()}`);
  expect(calendar.ok()).toBe(true);
  const data = dailyWorkLogSchema.parse(await calendar.json());
  expect(data.calendar.minutes).toBe(45);
  await expect(log.getByRole("region", { name: uk.WorkLog.calendar })).toBeVisible();
  const minutes = 120 + data.calendar.minutes;
  const total = `${Math.floor(minutes / 60)} год ${Math.round(minutes % 60)} хв`;
  await expect(log.locator("[data-work-log-total]")).toHaveText(total);
  await log.screenshot({ path: test.info().outputPath("work-log-duration.png") });
  await log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click();
  await expect(log).toHaveCount(0);
  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  await expect(taskRow.locator("[data-work-log-duration]")).toHaveText("01:30");
  await expect(reviewRow.locator("[data-work-log-duration]")).toHaveText("00:30");
  await expect(log.locator("[data-work-log-total]")).toHaveText(total);
  await chooseDuration(log, taskRow, "02", "00");
  await log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click();
  await expect(log).toHaveCount(0);
  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  await expect(taskRow.locator("[data-work-log-duration]")).toHaveText("02:00");
  await expect(reviewRow.locator("[data-work-log-duration]")).toHaveText("00:30");
  await expect(log.locator("[data-work-log-total]")).toHaveText("3 год 15 хв");
  const persisted = await reviewer.client.from("work_log_entries").select("activity_kind,minutes,review_round_id").eq("user_id", reviewer.id).throwOnError();
  expect(persisted.data).toHaveLength(2);
  expect(persisted.data.find(row => row.activity_kind === "review")?.review_round_id).toBeTruthy();

  // Existing entries outside the new choices remain exact and editable.
  const date = await log.getByLabel(uk.WorkLog.date).inputValue();
  const reviewRoundId = persisted.data.find(row => row.activity_kind === "review")?.review_round_id;
  if (!reviewRoundId) throw new Error("Expected a saved review round");
  await log.getByRole("button", { name: uk.WorkLog.close, exact: true }).click();
  await reviewer.client.rpc("save_daily_work_log", { p_work_date: date, p_entries: [
    { activity_kind: "task", task_id: fallbackTaskId, review_round_id: null, minutes: 795 },
    { activity_kind: "review", task_id: taskId, review_round_id: reviewRoundId, minutes: 37 },
  ] }).throwOnError();
  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  await expect(taskRow.locator("[data-work-log-duration]")).toHaveText("13:15");
  await expect(reviewRow.locator("[data-work-log-duration]")).toHaveText("00:37");
  await taskRow.locator("[data-work-log-duration]").click();
  await expect(log.getByRole("listbox", { name: "Години", exact: true }).getByRole("option", { name: "13", exact: true })).toHaveAttribute("aria-selected", "true");
  await taskRow.locator("[data-work-log-duration]").click();
  await reviewRow.locator("[data-work-log-duration]").click();
  await expect(log.getByRole("listbox", { name: "Хвилини", exact: true }).getByRole("option", { name: "37", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(log.getByRole("listbox", { name: "Години", exact: true }).getByRole("option", { name: "12", exact: true })).toBeAttached();
  await expect(log.getByRole("listbox", { name: "Години", exact: true }).getByRole("option", { name: "13", exact: true })).toHaveCount(0);
  await expect(log.getByRole("listbox", { name: "Хвилини", exact: true }).getByRole("option", { name: "60", exact: true })).toHaveCount(0);
  await reviewRow.locator("[data-work-log-duration]").click();
  await log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click();
  const unchanged = await reviewer.client.from("work_log_entries").select("activity_kind,minutes").eq("user_id", reviewer.id).throwOnError();
  expect(unchanged.data.find(row => row.activity_kind === "task")?.minutes).toBe(795);
  expect(unchanged.data.find(row => row.activity_kind === "review")?.minutes).toBe(37);
});
