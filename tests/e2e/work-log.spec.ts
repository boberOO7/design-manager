import { expect, test, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../helpers/task-review-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import { buildWorkLogReminders, dailyWorkLogSchema, getWorkLogReminderWindow, weeklyWorkLogSchema, workLogDayBounds, workLogRemindersSchema } from "../../src/lib/work-log";
import { addCalendarDays, instantToDateOnly, startOfMondayWeek, zonedWallTimeToIso } from "../../src/lib/calendar";
import uk from "../../messages/uk.json";

let fixture: TaskReviewFixture;

async function expandRowGroup(row: Locator) {
  const group = row.locator("xpath=ancestor::*[@data-work-log-group]");
  if (!await group.count()) return;
  const toggle = group.locator("[data-work-log-group-toggle]");
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
}

async function chooseDuration(log: Locator, row: Locator, hours: string, minutes: string) {
  await expandRowGroup(row);
  const trigger = row.locator("[data-work-log-duration]");
  await trigger.click();
  await log.getByRole("listbox", { name: "Години", exact: true }).getByRole("option", { name: hours, exact: true }).click();
  await log.getByRole("listbox", { name: "Хвилини", exact: true }).getByRole("option", { name: minutes, exact: true }).click();
  await trigger.click();
}
async function chooseWorkDate(log: Locator, date: string) {
  const trigger = log.getByLabel(uk.WorkLog.date, { exact: true });
  const current = await trigger.getAttribute("data-work-log-date");
  if (!current) throw new Error("Expected selected Work Log date");
  await trigger.click();
  const popup = log.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`);
  const monthIndex = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
  const offset = monthIndex(date) - monthIndex(current);
  for (let index = 0; index < Math.abs(offset); index++) {
    await popup.getByRole("button", { name: offset > 0 ? /^Наступний / : /^Попередній / }).click();
  }
  const gridStart = startOfMondayWeek(`${date.slice(0, 7)}-01`);
  const index = Math.round((Date.parse(date) - Date.parse(gridStart)) / 86_400_000);
  await popup.getByRole("gridcell").nth(index).click();
}
async function saveWorkLog(log: Locator, close = false) {
  const saved = log.page().waitForResponse(response => response.url().includes("/api/work-log") && response.request().method() === "PUT");
  await log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click();
  expect((await saved).ok()).toBe(true);
  if (close) await log.getByRole("button", { name: uk.WorkLog.close, exact: true }).click();
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
  await expandRowGroup(log.locator(`[data-work-log-row="task:${otherId}"]`));
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
  await saveWorkLog(log, true);
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
  const calendar = await page.request.get(`/api/work-log?date=${await log.getByLabel(uk.WorkLog.date).getAttribute("data-work-log-date")}`);
  expect(calendar.ok()).toBe(true);
  const data = dailyWorkLogSchema.parse(await calendar.json());
  expect(data.calendar.minutes).toBe(45);
  await expect(log.getByRole("region", { name: uk.WorkLog.calendar })).toBeVisible();
  const minutes = 120 + data.calendar.minutes;
  const total = `${Math.floor(minutes / 60)} год ${Math.round(minutes % 60)} хв`;
  await expect(log.locator("[data-work-log-total]")).toHaveText(total);
  await log.screenshot({ path: test.info().outputPath("work-log-duration.png") });
  await saveWorkLog(log, true);
  await expect(log).toHaveCount(0);
  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  await expect(taskRow.locator("[data-work-log-duration]")).toHaveText("01:30");
  await expect(reviewRow.locator("[data-work-log-duration]")).toHaveText("00:30");
  await expect(log.locator("[data-work-log-total]")).toHaveText(total);
  await chooseDuration(log, taskRow, "02", "00");
  await saveWorkLog(log, true);
  await expect(log).toHaveCount(0);
  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  await expect(taskRow.locator("[data-work-log-duration]")).toHaveText("02:00");
  await expect(reviewRow.locator("[data-work-log-duration]")).toHaveText("00:30");
  await expect(log.locator("[data-work-log-total]")).toHaveText("3 год 15 хв");
  const persisted = await reviewer.client.from("work_log_entries").select("activity_kind,minutes,review_round_id").eq("user_id", reviewer.id).throwOnError();
  expect(persisted.data).toHaveLength(2);
  expect(persisted.data.find(row => row.activity_kind === "review")?.review_round_id).toBeTruthy();

  // Existing entries outside the new choices remain exact and editable.
  const date = await log.getByLabel(uk.WorkLog.date).getAttribute("data-work-log-date");
  if (!date) throw new Error("Expected selected Work Log date");
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

test("weekly editor → save → historical edit → next-day reminder → catch up missing days including a saved zero-hour day", async ({ page }) => {
  const { assignee, taskId, studioId } = fixture;
  // Replay the server's Kyiv date boundary while retaining real authenticated API reads/writes.
  // Time-off eligibility and the real server summary are independently covered by integration tests.
  const monday = startOfMondayWeek(instantToDateOnly(new Date().toISOString()));
  const historicalDate = addCalendarDays(monday, -14), joinedDate = addCalendarDays(monday, -28);
  const tuesday = addCalendarDays(monday, 1), wednesday = addCalendarDays(monday, 2), thursday = addCalendarDays(monday, 3), friday = addCalendarDays(monday, 4);
  let today = thursday;
  let holdNextReminder = false;
  let releaseDelayedReminder: () => void = () => {};
  let signalDelayedReminder: () => void = () => {};
  const delayedReminderStarted = new Promise<void>(resolve => { signalDelayedReminder = resolve; });
  reviewSql(`update public.studio_members set joined_at='${joinedDate}T00:00:00Z' where studio_id=${sqlId(studioId)} and user_id=${sqlId(assignee.id)};`);
  await assignee.client.rpc("save_daily_work_log", { p_work_date: historicalDate, p_entries: [{ activity_kind: "task", task_id: taskId, review_round_id: null, minutes: 20 }] }).throwOnError();
  await page.clock.setFixedTime(new Date(zonedWallTimeToIso(`${today}T12:00`)));
  await page.route("**/api/work-log?mode=*", async route => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const mode = new URL(route.request().url()).searchParams.get("mode");
    if (mode === "reminders") {
      const live = workLogRemindersSchema.parse(await response.json());
      const saved = await assignee.client.from("work_log_days").select("work_date,submitted_at").eq("user_id", assignee.id).throwOnError();
      const summary = { scope: live.scope, ...buildWorkLogReminders(today, saved.data, { joinedDate }) };
      if (holdNextReminder) {
        holdNextReminder = false;
        await new Promise<void>(resolve => { releaseDelayedReminder = resolve; signalDelayedReminder(); });
      }
      return route.fulfill({ response, json: summary });
    }
    const week = weeklyWorkLogSchema.parse(await response.json());
    const reminderWindow = getWorkLogReminderWindow(today, joinedDate);
    return route.fulfill({ response, json: { ...week, today, days: week.days.map(day => ({ ...day, missing: day.date >= reminderWindow.from && day.date < today && day.kind === "day" && day.submittedAt === null })) } });
  });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://localhost:3100" }]);
  await signInLocalTestUser(page, assignee);
  const entry = page.getByRole("button", { name: uk.WorkLog.entry, exact: true });
  const log = page.getByRole("dialog");
  const row = log.locator(`[data-work-log-row="task:${taskId}"]`);
  await entry.click();
  await chooseWorkDate(log, monday);
  await expect(log.getByLabel(uk.WorkLog.date, { exact: true })).toHaveAttribute("data-work-log-date", monday);
  await chooseDuration(log, row, "01", "00");
  await saveWorkLog(log, true);
  await expect(log).toHaveCount(0);
  await entry.click();
  await chooseWorkDate(log, monday);
  await expect(row.locator("[data-work-log-duration]")).toHaveText("01:00");
  await expect(log.locator(`[data-work-log-day="${monday}"]`)).toHaveAccessibleName(new RegExp(uk.WorkLog.completed));
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("1 год 0 хв");
  await log.locator(`[data-work-log-day="${tuesday}"]`).click();
  await expect(log.getByLabel(uk.WorkLog.date, { exact: true })).toHaveAttribute("data-work-log-date", tuesday);
  await expect(row).toBeVisible();
  await chooseDuration(log, row, "01", "30");
  await log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click();
  await expect(log).toHaveAccessibleName(uk.WorkLog.title);
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("2 год 30 хв");
  await log.getByRole("button", { name: uk.WorkLog.previousWeek, exact: true }).click();
  await expect(log.locator(`[data-work-log-day="${addCalendarDays(monday, -7)}"]`)).toBeVisible();
  await log.getByRole("button", { name: uk.WorkLog.previousWeek, exact: true }).click();
  await expect(log.locator(`[data-work-log-day="${historicalDate}"]`)).toBeVisible();
  await expect(log.locator(`[data-work-log-day="${historicalDate}"]`)).toBeVisible();
  await chooseWorkDate(log, historicalDate);
  await expect(log.locator("[data-work-log-total]")).toHaveText("0 год 20 хв");
  await expect(log.getByRole("button", { name: uk.WorkLog.fillMissing, exact: true })).toHaveCount(0);
  await expect(log.getByLabel(uk.WorkLog.date, { exact: true })).toHaveAttribute("data-work-log-date", historicalDate);
  await expect(row.locator("[data-work-log-duration]")).toHaveText("00:20");
  await chooseDuration(log, row, "00", "25");
  await log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click();
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("0 год 25 хв");
  await expect(log.getByRole("button", { name: uk.WorkLog.fillMissing, exact: true })).toHaveCount(0);
  await expect(page.locator("[data-work-log-missing-count]")).toHaveText("1 день"); // Wednesday remains missing; historical edits add no backlog.
  await chooseWorkDate(log, tuesday);
  await expect(row.locator("[data-work-log-duration]")).toHaveText("01:30");
  await log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click();
  await expect(log).toHaveAccessibleName(uk.WorkLog.title);
  await expect(log.locator(`[data-work-log-day="${monday}"]`)).toHaveAccessibleName(new RegExp(uk.WorkLog.completed));
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("2 год 30 хв");
  await log.getByRole("button", { name: uk.WorkLog.close, exact: true }).click();

  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto("about:blank");
  today = thursday;
  await page.clock.setFixedTime(new Date(zonedWallTimeToIso(`${today}T12:00`)));
  await page.goto("/dashboard");
  await expect(page.locator("[data-work-log-missing-count]")).toHaveText("1 день");
  const toast = page.locator("[data-work-log-reminder]");
  await expect(toast).toContainText(uk.WorkLog.missingYesterday);
  await toast.getByRole("button", { name: uk.WorkLog.fill, exact: true }).click();
  await expect(log.getByLabel(uk.WorkLog.date, { exact: true })).toHaveAttribute("data-work-log-date", wednesday);
  await expect(row.locator("[data-work-log-duration]")).toHaveText("00:00");
  await log.getByRole("button", { name: uk.WorkLog.close, exact: true }).click();
  await page.reload();
  await expect(page.locator("[data-work-log-missing-count]")).toHaveText("1 день");
  await expect(toast).toHaveCount(0); // Same session/day cannot nag again.

  await page.goto("about:blank");
  today = friday;
  await page.clock.setFixedTime(new Date(zonedWallTimeToIso(`${today}T12:00`)));
  await page.goto("/dashboard");
  await expect(page.locator("[data-work-log-missing-count]")).toHaveText("2 дні");
  await expect(toast).toContainText(uk.WorkLog.missingYesterday);
  await toast.getByRole("button", { name: uk.WorkLog.fill, exact: true }).click();
  await expect(log).toHaveAccessibleName(uk.WorkLog.title);
  // A response captured before saving must not resurrect an obsolete reminder after catch-up.
  holdNextReminder = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await delayedReminderStarted;
  await log.getByRole("button", { name: uk.WorkLog.fillMissing, exact: true }).click();
  await expect(log.getByLabel(uk.WorkLog.date, { exact: true })).toHaveAttribute("data-work-log-date", wednesday);
  await expect(row.locator("[data-work-log-duration]")).toHaveText("00:00");
  await expect(log.getByLabel(uk.WorkLog.date, { exact: true })).toBeDisabled();
  await log.getByRole("button", { name: uk.WorkLog.saveAndContinue, exact: true }).click();
  await expect(log.getByLabel(uk.WorkLog.date, { exact: true })).toHaveAttribute("data-work-log-date", thursday);
  await chooseDuration(log, row, "00", "15");
  await log.getByRole("button", { name: uk.WorkLog.saveAndContinue, exact: true }).click();
  await expect(log).toHaveAccessibleName(uk.WorkLog.title);
  await expect(log.locator(`[data-work-log-day="${wednesday}"]`)).toHaveAccessibleName(new RegExp(uk.WorkLog.completed));
  await expect(log.locator(`[data-work-log-day="${wednesday}"] [data-work-log-day-total]`)).toHaveText("0:00");
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("2 год 45 хв");
  await expect(page.locator("[data-work-log-missing-count]")).toHaveCount(0);
  await expect(log.getByRole("button", { name: uk.WorkLog.fillMissing, exact: true })).toHaveCount(0);
  const lateResponse = page.waitForResponse(response => response.url().includes("/api/work-log?mode=reminders"));
  releaseDelayedReminder();
  await lateResponse;
  await log.getByRole("button", { name: uk.WorkLog.close, exact: true }).click();
  await expect(toast).toHaveCount(0);
  await expect(page.locator("[data-work-log-missing-count]")).toHaveCount(0);
  const zero = await assignee.client.from("work_log_days").select("submitted_at").eq("work_date", wednesday).single().throwOnError();
  expect(zero.data.submitted_at).toBeTruthy();
  expect((await assignee.client.from("work_log_entries").select("id").eq("work_date", wednesday).throwOnError()).data).toEqual([]);
});


test("single weekly editor keeps date switches stable, carries reviews, and blocks future work", async ({ page }) => {
  const { admin, assignee, reviewer, taskId, fallbackTaskId } = fixture;
  const today = instantToDateOnly(new Date().toISOString());
  const yesterday = addCalendarDays(today, -1), tomorrow = addCalendarDays(today, 1);
  await admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "configure", p_reviewer_ids: [reviewer.id] }).throwOnError();
  await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
  reviewSql(`update public.task_review_rounds set submitted_at='${workLogDayBounds(yesterday).start}' where task_id=${sqlId(taskId)};`);
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://localhost:3100" }]);
  await signInLocalTestUser(page, reviewer);
  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  const log = page.getByRole("dialog", { name: uk.WorkLog.title });
  const review = log.locator('[data-work-log-row^="review:"]');
  await expect(review).toBeVisible();
  await expect(log.getByRole("group")).toHaveCount(0);
  await expect(log.getByRole("heading", { name: uk.WorkLog.title })).toBeVisible();
  const heading = await log.getByRole("heading", { name: uk.WorkLog.title, exact: true }).boundingBox(), close = await log.getByRole("button", { name: uk.WorkLog.close, exact: true }).boundingBox();
  if (!heading || !close) throw new Error("Expected header controls");
  expect(Math.abs(heading.y + heading.height / 2 - close.y - close.height / 2)).toBeLessThan(2);
  let release = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  let started = () => {};
  const pending = new Promise<void>(resolve => { started = resolve; });
  let holdDate = true;
  await page.route(`**/api/work-log?date=${yesterday}`, async route => {
    const response = await route.fetch();
    if (holdDate) { holdDate = false; started(); await hold; }
    const loaded = dailyWorkLogSchema.parse(await response.json());
    const extraTask = loaded.activeTasks.find(task => task.id === fallbackTaskId);
    if (!extraTask) throw new Error("Expected a visible task for the layout regression");
    await route.fulfill({ response, json: { ...loaded, rows: [...loaded.rows, {
      activity_kind: "task", task_id: extraTask.id, review_round_id: null, minutes: 0,
      title: extraTask.title, projectName: extraTask.projectName, projectId: extraTask.projectId,
      stage: extraTask.stage, stageName: extraTask.stageName, roundNumber: null,
    }] } });
  });
  const originalDialog = await log.elementHandle();
  const height = (await log.boundingBox())?.height;
  if (!height || !originalDialog) throw new Error("Expected visible dialog");
  await chooseWorkDate(log, yesterday);
  await pending;
  await expect(log.getByRole("status")).toHaveText(uk.WorkLog.loading);
  await expect(log.getByRole("button", { name: uk.WorkLog.save, exact: true })).toBeDisabled();
  await expect(review).toBeVisible();
  expect(Math.abs(((await log.boundingBox())?.height ?? 0) - height)).toBeLessThan(1);
  expect(await originalDialog.evaluate(element => element.isConnected)).toBe(true);
  release();
  await expect(log.getByRole("button", { name: uk.WorkLog.save, exact: true })).toBeEnabled();
  await expect(log.locator("[data-work-log-row]")).toHaveCount(2);
  expect(Math.abs(((await log.boundingBox())?.height ?? 0) - height)).toBeLessThan(1);
  await chooseDuration(log, review, "00", "20");
  await saveWorkLog(log);
  await expect(log.locator(`[data-work-log-day="${yesterday}"]`)).toHaveAccessibleName(new RegExp(uk.WorkLog.completed));
  await expect(log.locator(`[data-work-log-day="${yesterday}"] [data-work-log-day-total]`)).toHaveText("0:20");
  await chooseWorkDate(log, today);
  await expect(review.locator("[data-work-log-duration]")).toHaveText("00:00");
  await expect(log.locator("[data-work-log-row]")).toHaveCount(1);
  expect(Math.abs(((await log.boundingBox())?.height ?? 0) - height)).toBeLessThan(1);
  await chooseDuration(log, review, "00", "10");
  await saveWorkLog(log);
  await expect(log.locator(`[data-work-log-day="${today}"] [data-work-log-day-total]`)).toHaveText("0:10");
  await expect(log.getByRole("button", { name: uk.WorkLog.nextWeek, exact: true })).toBeDisabled();
  for (let date = tomorrow; date <= addCalendarDays(startOfMondayWeek(today), 6); date = addCalendarDays(date, 1)) {
    await expect(log.locator(`[data-work-log-day="${date}"]`)).toBeDisabled();
  }
  const futureDays = log.locator("[data-work-log-day]:disabled");
  if (await futureDays.count() >= 2) {
    const first = await futureDays.nth(0).boundingBox(), second = await futureDays.nth(1).boundingBox();
    if (!first || !second) throw new Error("Expected future days in the week");
    const cursors = await page.evaluate(({ from, through, y }) =>
      Array.from({ length: 9 }, (_, index) => {
        const element = document.elementFromPoint(from + (through - from) * index / 8, y);
        return element ? getComputedStyle(element).cursor : null;
      }), { from: first.x + first.width - 2, through: second.x + 2, y: first.y + first.height / 2 });
    expect(cursors).toEqual(Array(9).fill("not-allowed"));
  }
  const trigger = log.getByLabel(uk.WorkLog.date);
  await trigger.click();
  const popup = log.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`);
  const index = Math.round((Date.parse(tomorrow) - Date.parse(startOfMondayWeek(`${today.slice(0, 7)}-01`))) / 86_400_000);
  await expect(popup.getByRole("gridcell").nth(index)).toBeDisabled();
  await trigger.click();
  await expect(trigger).toHaveAttribute("data-work-log-date", today);
  const futureSave = await page.request.put("/api/work-log", { data: { date: tomorrow, entries: [] } });
  expect(futureSave.status()).toBe(400);
  expect((await reviewer.client.from("work_log_days").select("work_date").eq("work_date", tomorrow).throwOnError()).data).toEqual([]);
  // Both week and day loads can recover without switching to another view.
  const previousWeek = addCalendarDays(startOfMondayWeek(today), -7);
  let failWeek = true;
  await page.route(`**/api/work-log?mode=week&date=${previousWeek}`, route => failWeek ? route.fulfill({ status: 500, json: { success: false } }) : route.continue());
  await log.getByRole("button", { name: uk.WorkLog.previousWeek, exact: true }).click();
  await expect(log.getByRole("alert")).toContainText(uk.WorkLog.loadFailed);
  failWeek = false;
  await log.getByRole("button", { name: uk.WorkLog.retry, exact: true }).click();
  await expect(log.getByRole("alert")).toHaveCount(0);
  await chooseWorkDate(log, today);
  await expect(review.locator("[data-work-log-duration]")).toHaveText("00:10");
  await log.screenshot({ path: test.info().outputPath("work-log-week-editor.png") });
  await page.setViewportSize({ width: 375, height: 760 });
  await expect(log.getByRole("button", { name: uk.WorkLog.save, exact: true })).toBeInViewport();
  await expect(log.getByLabel(uk.WorkLog.date)).toBeInViewport();
  expect(await log.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("direct review group time → manual edit → save/reopen, partial selection, singleton and weekly navigation", async ({ page }) => {
  const { admin, assignee, reviewer, taskId, fallbackTaskId, projectId } = fixture;
  const today = instantToDateOnly(new Date().toISOString());
  const previousMonday = addCalendarDays(startOfMondayWeek(today), -7);
  await admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "configure", p_reviewer_ids: [reviewer.id] }).throwOnError();
  const roundIds: string[] = [];
  for (let number = 1; number <= 10; number++) {
    await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
    const round = (await reviewer.client.from("task_review_rounds").select("id").eq("task_id", taskId).eq("round_number", number).single().throwOnError()).data;
    roundIds.push(round.id);
    if (number < 10) await reviewer.client.rpc("update_task_review", { p_task_id: taskId, p_action: "rework", p_round_id: round.id, p_comment: "Adjust drawings" }).throwOnError();
  }
  await admin.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_action: "configure", p_reviewer_ids: [reviewer.id] }).throwOnError();
  await assignee.client.rpc("update_task_review", { p_task_id: fallbackTaskId, p_action: "submit" }).throwOnError();
  const singletonRound = (await reviewer.client.from("task_review_rounds").select("id").eq("task_id", fallbackTaskId).single().throwOnError()).data;
  // Open waiting reviews become suggestions only after actual review activity.
  for (const roundId of [roundIds[9], singletonRound.id]) {
    const sessionId = randomUUID();
    await reviewer.client.rpc("control_review_timer", { p_action: "start", p_session_id: sessionId, p_round_ids: [roundId] }).throwOnError();
    await reviewer.client.rpc("control_review_timer", { p_action: "pause", p_session_id: sessionId }).throwOnError();
  }
  reviewSql(`update public.project_task_stage_columns set display_name='Review plans' where project_id=${sqlId(projectId)} and stage='stage_1';
    update public.project_task_stage_columns set display_name=null where project_id=${sqlId(projectId)} and stage='stage_2';`);
  const { start } = workLogDayBounds(today);
  await reviewer.client.rpc("create_calendar_event_with_invites", { p_studio_id: fixture.studioId,
    p_title: "Allocation Calendar context", p_event_type: "meeting", p_starts_at: start,
    p_ends_at: new Date(Date.parse(start) + 45 * 60_000).toISOString(), p_all_day: false, p_meeting_mode: "online" }).throwOnError();
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://localhost:3100" }]);
  await signInLocalTestUser(page, reviewer);
  // This route has no task-domain messages: Work Log stages must come from the shell.
  await page.goto(`/team/${reviewer.id}`);
  const entry = page.getByRole("button", { name: uk.WorkLog.entry, exact: true });
  await entry.click();
  const log = page.getByRole("dialog", { name: uk.WorkLog.title });
  const reviews = log.getByRole("region", { name: uk.WorkLog.reviews, exact: true });
  const group = reviews.locator("[data-work-log-group]");
  const row = (index: number) => log.locator(`[data-work-log-row="review:${roundIds[index]}"]`);
  const singleton = log.locator(`[data-work-log-row="review:${singletonRound.id}"]`);
  const total = group.locator("[data-work-log-group-duration]");
  const toggle = group.locator("[data-work-log-group-toggle]");
  await expect(group).toHaveCount(1);
  await expect(toggle).toContainText("Review rounds project");
  await expect(toggle).toContainText("Review plans");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(group.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`)).toHaveAttribute("inert", "");
  await expect(group.getByRole("button", { name: uk.WorkLog.selectPart, exact: true })).toHaveCount(0);
  await expect(total).toHaveText("00:00");
  await expect(singleton).toBeVisible();
  await expect(singleton).toContainText(uk.TaskStages.stage_2);
  await expect(singleton.locator("[data-work-log-group-duration]")).toHaveCount(0);
  await expect(log).not.toContainText("TaskStages.stage_2");
  const groupControl = group.locator("[data-time-picker-control]").first();
  async function expectAligned(control: Locator) {
    const header = await groupControl.boundingBox(), entry = await control.boundingBox();
    if (!header || !entry) throw new Error("Expected visible duration controls");
    expect(Math.abs(header.x - entry.x)).toBeLessThan(1);
    expect(entry.width).toBe(header.width);
    expect(entry.height).toBe(header.height);
  }
  await expectAligned(singleton.locator("[data-time-picker-control]"));
  const groupTypography = await total.locator(":scope > span").evaluate(element => {
    const style = getComputedStyle(element);
    return [style.fontFamily, style.fontSize, style.fontWeight];
  });
  const rowTypography = await singleton.locator("[data-work-log-duration] > span").evaluate(element => {
    const style = getComputedStyle(element);
    return [style.fontFamily, style.fontSize, style.fontWeight];
  });
  expect(groupTypography).toEqual(rowTypography);
  const width = (await log.boundingBox())?.width;
  expect(width).toBeGreaterThanOrEqual(800);
  expect(width).toBeLessThanOrEqual(850);

  await expect(total).toHaveJSProperty("tagName", "BUTTON");
  await expect(group.getByRole("textbox")).toHaveCount(0);
  await total.locator(":scope > span").click();
  await expect(log.getByRole("listbox", { name: "Години", exact: true })).toBeVisible();
  await total.press("1");
  await expect(total).toHaveText("00:00");
  await log.getByRole("listbox", { name: "Години", exact: true }).getByRole("option", { name: "03", exact: true }).click();
  await log.getByRole("listbox", { name: "Хвилини", exact: true }).getByRole("option", { name: "00", exact: true }).click();
  await total.click();
  await expect(total).toHaveText("03:00");
  await expect(log.locator("[data-work-log-total]")).toHaveText("3 год 45 хв");
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("3 год 45 хв");
  await expect(log.locator(`[data-work-log-day="${today}"] [data-work-log-day-total]`)).toHaveText("3:45");
  expect((await reviewer.client.from("work_log_entries").select("id").eq("user_id", reviewer.id).throwOnError()).data).toEqual([]);
  await toggle.click();
  for (let index = 0; index < 10; index++) {
    await expect(row(index)).toBeVisible();
    await expect(row(index)).toContainText(`Review #${index + 1}`);
    await expect(row(index).locator("[data-work-log-duration]")).toHaveText("00:18");
    await expect(row(index).getByRole("checkbox")).toHaveCount(0);
    await expectAligned(row(index).locator("[data-time-picker-control]"));
  }
  await expect(log.locator('[data-work-log-row^="review:"]')).toHaveCount(11);
  await chooseDuration(log, row(1), "00", "25");
  await expect(total).toHaveText("03:07");
  await expect(row(0).locator("[data-work-log-duration]")).toHaveText("00:18");
  await chooseDuration(log, singleton, "00", "10");
  await expect(log.locator("[data-work-log-total]")).toHaveText("4 год 2 хв");
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("4 год 2 хв");
  await saveWorkLog(log, true);
  await expect(log).toHaveCount(0);
  await entry.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(total).toHaveText("03:07");
  await expect(singleton.locator("[data-work-log-duration]")).toHaveText("00:10");
  await expect(log.locator("[data-work-log-total]")).toHaveText("4 год 2 хв");
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("4 год 2 хв");
  await toggle.click();
  for (let index = 0; index < 10; index++) await expect(row(index).locator("[data-work-log-duration]")).toHaveText(index === 1 ? "00:25" : "00:18");
  const persisted = await reviewer.client.from("work_log_entries").select("activity_kind,task_id,review_round_id,minutes").eq("user_id", reviewer.id).eq("work_date", today).throwOnError();
  expect(persisted.data).toHaveLength(11);
  for (let index = 0; index < 10; index++) expect(persisted.data.find(value => value.review_round_id === roundIds[index]))
    .toEqual({ activity_kind: "review", task_id: taskId, review_round_id: roundIds[index], minutes: index === 1 ? 25 : 18 });

  await group.getByRole("button", { name: uk.WorkLog.selectPart, exact: true }).click();
  await group.getByRole("button", { name: uk.WorkLog.deselectAll, exact: true }).click();
  await expect(total).toBeDisabled();
  await row(0).getByRole("checkbox").check();
  await row(1).getByRole("checkbox").check();
  await expect(total).toHaveText("00:43");
  await expect(group).toContainText("Для вибраних: 2 із 10");
  await expect(group).toContainText("Усього в групі: 03:07");
  await total.locator(":scope > span").click();
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("00:45"); await dialog.dismiss(); });
  await log.getByRole("listbox", { name: "Хвилини", exact: true }).getByRole("option", { name: "45", exact: true }).click();
  await total.click();
  await expect(total).toHaveText("00:43");
  await expect(row(0).locator("[data-work-log-duration]")).toHaveText("00:18");
  await expect(row(1).locator("[data-work-log-duration]")).toHaveText("00:25");
  await total.click();
  page.once("dialog", async dialog => { await dialog.accept(); });
  await log.getByRole("listbox", { name: "Хвилини", exact: true }).getByRole("option", { name: "45", exact: true }).click();
  await total.click();
  await expect(total).toHaveText("00:45");
  const selectedMinutes = await Promise.all([row(0), row(1)].map(async item => {
    const [hours, minutes] = (await item.locator("[data-work-log-duration]").innerText()).split(":").map(Number);
    return hours * 60 + minutes;
  }));
  expect(selectedMinutes.sort((a, b) => a - b)).toEqual([22, 23]);
  for (let index = 2; index < 10; index++) await expect(row(index).locator("[data-work-log-duration]")).toHaveText("00:18");
  await expect(singleton.locator("[data-work-log-duration]")).toHaveText("00:10");
  await expect(group).toContainText("Усього в групі: 03:09");
  await group.getByRole("button", { name: uk.WorkLog.allReviews, exact: true }).click();
  await expect(total).toHaveText("03:09");
  await saveWorkLog(log, true);
  await expect(log).toHaveCount(0);
  await entry.click();
  await expect(total).toHaveText("03:09");
  await expect(log.locator("[data-work-log-total]")).toHaveText("4 год 4 хв");
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("4 год 4 хв");
  await log.getByRole("button", { name: uk.WorkLog.previousWeek, exact: true }).click();
  await expect(log.locator(`[data-work-log-day="${previousMonday}"]`)).toBeVisible();
  await log.getByRole("button", { name: uk.WorkLog.nextWeek, exact: true }).click();
  await expect(log.locator(`[data-work-log-day="${today}"]`)).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(total).toHaveText("03:09");
  await expect(log.locator("[data-work-log-total]")).toHaveText("4 год 4 хв");
  await expect(log.locator("[data-work-log-week-total]")).toHaveText("4 год 4 хв");
});
