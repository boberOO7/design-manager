import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../helpers/task-review-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import { addCalendarDays, instantToDateOnly } from "../../src/lib/calendar";
import { getWorkdayKind } from "../../src/lib/workdays";
import { shiftActivityMonth, teamActivityReportSchema } from "../../src/lib/team-activity";
import uk from "../../messages/uk.json";

let fixture: TaskReviewFixture;
test.beforeAll(async () => { fixture = await createTaskReviewFixture(); });
test.afterAll(async () => {
  if (!fixture) return;
  reviewSql(`delete from public.time_off_requests where studio_id=${sqlId(fixture.studioId)};
    delete from public.notifications where studio_id=${sqlId(fixture.studioId)};
    delete from public.studio_days_off where studio_id=${sqlId(fixture.studioId)};`);
  // Match local navigation tests: remove only this fixture's immutable membership history.
  reviewSql(`begin; set local session_replication_role=replica;
    delete from private.finance_labor_membership_events where studio_id=${sqlId(fixture.studioId)};
    set local session_replication_role=origin; commit;`);
  await fixture.dispose();
});

test("groups mixed activities and expands shared review sessions with aligned durations", async ({ page }, testInfo) => {
  const today = instantToDateOnly(new Date().toISOString());
  const sharedTasks: string[] = Array.from({ length: 12 }, () => randomUUID());
  reviewSql(`insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values ${sharedTasks.map((id, index) =>
    `(${sqlId(id)},${sqlId(fixture.projectId)},'Shared calendar review ${index + 1}','stage_1','in_progress','normal',${sqlId(fixture.assignee.id)},${sqlId(fixture.admin.id)})`).join(",")};`);
  for (const taskId of [...sharedTasks, fixture.fallbackTaskId]) {
    await fixture.admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "configure", p_reviewer_ids: [fixture.reviewer.id] }).throwOnError();
    await fixture.assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
  }
  const rounds = await fixture.service.from("task_review_rounds").select("id,task_id").in("task_id", [...sharedTasks, fixture.fallbackTaskId]).throwOnError();
  const sharedRounds = rounds.data.filter(round => sharedTasks.includes(round.task_id));
  const separateRound = rounds.data.find(round => round.task_id === fixture.fallbackTaskId)!;
  const sharedSession = randomUUID(), separateSession = randomUUID();
  for (const [id, ids] of [[sharedSession, sharedRounds.map(round => round.id)], [separateSession, [separateRound.id]]] as const) {
    await fixture.reviewer.client.rpc("control_review_timer", { p_action: "start", p_session_id: id, p_round_ids: [...ids] }).throwOnError();
    await fixture.reviewer.client.rpc("control_review_timer", { p_action: "pause", p_session_id: id }).throwOnError();
  }
  await fixture.service.from("work_log_entries").upsert([
    ...sharedRounds.map((round, index) => ({ studio_id: fixture.studioId, user_id: fixture.reviewer.id, work_date: today, activity_kind: "review", task_id: round.task_id, review_round_id: round.id, minutes: index === 0 ? 7 : 8 })),
    { studio_id: fixture.studioId, user_id: fixture.reviewer.id, work_date: today, activity_kind: "review", task_id: separateRound.task_id, review_round_id: separateRound.id, minutes: 15 },
  ], { onConflict: "user_id,work_date,task_id,review_round_id" }).throwOnError();
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: testInfo.project.use.baseURL ?? "http://localhost:3000" }]);
  await signInLocalTestUser(page, fixture.admin);
  await page.route("**/api/statistics/team-activity?month=*", async route => {
    const response = await route.fetch();
    const report = teamActivityReportSchema.parse(await response.json());
    const person = report.people.find(person => person.id === fixture.reviewer.id)!;
    const current = person.days.find(day => day.date === today)!;
    // Interleave categories in the response to exercise presentation without extra tracking records.
    current.items.splice(1, 0, { activityKind: "internal", internalActivityType: "team_walkthrough", task: null, minutes: 15, reviewRoundId: null, reviewSessionId: null });
    const task = { id: fixture.taskId, title: "Робота над деталізованим плануванням стоматологічної клініки та узгодженням довгої назви проєкту", project_id: fixture.projectId, project: { id: fixture.projectId, name: "Review rounds project" } };
    current.items.splice(3, 0, { activityKind: "task", internalActivityType: null, task, minutes: 45, reviewRoundId: null, reviewSessionId: null });
    current.items.push({ activityKind: "review", internalActivityType: null, task: { ...task, title: "Historical review" }, minutes: 10, reviewRoundId: "historical", reviewSessionId: null });
    current.minutes += 70;
    const days = person.days.filter(day => day.date !== today);
    for (const [index, state] of ["missing", "under", "target", "over", "worked", "excused", "absence"].entries()) {
      const day = days[index];
      day.recorded = state !== "missing";
      day.kind = state === "absence" ? "time_off" : state === "worked" || state === "excused" ? "weekend" : "day";
      day.minutes = state === "under" || state === "worked" ? 10 : state === "target" ? report.workdayMinutes : state === "over" ? report.workdayMinutes + 1 : 0;
    }
    await route.fulfill({ response, json: report });
  });
  await page.goto("/statistics?section=team&period=3");
  const calendar = page.locator("#stats-team-activity");
  const row = calendar.getByRole("row").filter({ hasText: "Review Reviewer" });
  const cell = row.locator(`[data-activity-date="${today}"]`);
  await expect(cell).toHaveAttribute("aria-label", /3:00 год/);
  const reportResponse = await page.request.get(`/api/statistics/team-activity?month=${today.slice(0, 7)}`);
  expect(reportResponse.status()).toBe(200);
  const day = teamActivityReportSchema.parse(await reportResponse.json()).people.find(person => person.id === fixture.reviewer.id)!.days.find(day => day.date === today)!;
  expect(day.minutes).toBe(110);
  expect(day.items.filter(item => item.reviewSessionId === sharedSession).reduce((sum, item) => sum + item.minutes, 0)).toBe(95);
  expect(day.items.filter(item => item.reviewSessionId === separateSession)).toHaveLength(1);

  for (const state of ["missing", "under", "target", "over", "worked", "excused"]) {
    const target = row.locator(`[data-activity-state="${state}"]`).first();
    await page.mouse.move(0, 0);
    const before = await target.evaluate(element => ({
      fill: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor,
      markFill: getComputedStyle(element.firstElementChild!).backgroundColor, markBorder: getComputedStyle(element.firstElementChild!).borderColor,
      width: element.parentElement!.getBoundingClientRect().width,
    }));
    await target.hover();
    await expect(target).toHaveCSS("transform", "matrix(1.1, 0, 0, 1.1, 0, 0)");
    await expect(target).toHaveCSS("transition-duration", "0.14s");
    await expect(target).toHaveCSS("transition-timing-function", "ease-out");
    const after = await target.evaluate(element => ({
      fill: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor,
      markFill: getComputedStyle(element.firstElementChild!).backgroundColor, markBorder: getComputedStyle(element.firstElementChild!).borderColor,
      width: element.parentElement!.getBoundingClientRect().width,
    }));
    expect(after).toEqual(before);
    expect(Number(await target.evaluate(element => getComputedStyle(element).zIndex))).toBeGreaterThan(0);
  }
  const absence = row.locator('[data-day-kind="time_off"]').first();
  await absence.hover();
  await expect(absence).toHaveCSS("transform", "matrix(1.1, 0, 0, 1.1, 0, 0)");
  await cell.focus();
  await cell.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip.getByRole("heading", { level: 3 })).toHaveText([uk.Statistics.taskWork, uk.Statistics.reviewWork, uk.Statistics.internalWork]);
  const categories = tooltip.locator("[data-activity-category]");
  await expect(categories.locator(":scope > div > [data-activity-duration]")).toHaveText(["0:45", "2:00", "0:15"]);
  const taskCategory = tooltip.locator('[data-activity-category="task"]');
  const reviewCategory = tooltip.locator('[data-activity-category="review"]');
  const internalCategory = tooltip.locator('[data-activity-category="internal"]');
  await expect(taskCategory.getByRole("link")).toHaveAttribute("href", `/projects/${fixture.projectId}?task=${fixture.taskId}`);
  expect((await taskCategory.getByRole("link").boundingBox())!.height).toBeGreaterThan(20);
  await expect(reviewCategory.getByRole("link", { name: "Historical review" })).toBeVisible();
  await expect(internalCategory).toContainText(uk.Statistics.activityInternalWalkthrough);
  await expect(reviewCategory.locator(":scope > div")).toHaveAttribute("style", "color: var(--ui-info-text);");
  const neutralTitleColor = await taskCategory.getByRole("link").evaluate(element => getComputedStyle(element).color);
  await expect(reviewCategory.getByRole("heading")).toHaveCSS("color", neutralTitleColor);
  await expect(internalCategory.getByRole("heading")).toHaveCSS("color", neutralTitleColor);
  await expect(tooltip.locator("details")).toHaveCount(2);
  const group = tooltip.locator(`[data-review-session="${sharedSession}"]`);
  await expect(group).not.toHaveAttribute("open");
  await expect(group.getByRole("link")).toHaveCount(0);
  await expect(group.locator("summary > [data-activity-duration]")).toHaveText("1:35");
  await expect(group.locator("summary > span").last()).toHaveText("12 задач");
  await group.locator("summary").hover();
  await group.locator("summary").click();
  await expect(group).toHaveAttribute("open", "");
  await expect(group.getByRole("link")).toHaveCount(12);
  await expect(group).toContainText("0:07");
  await expect(group).toContainText("0:08");
  expect(await tooltip.locator("[data-activity-duration]").evaluateAll(elements => elements.every(element => /^\d+:\d{2}$/.test(element.textContent ?? "")))).toBe(true);
  const timePositions = await tooltip.locator("[data-activity-duration]").evaluateAll(elements => elements
    .filter(element => element.getBoundingClientRect().width > 0).map(element => element.getBoundingClientRect().right));
  expect(Math.max(...timePositions) - Math.min(...timePositions)).toBeLessThan(1);
  const summaryTime = await group.locator("summary > [data-activity-duration]").boundingBox();
  const sessionTitle = await group.locator("summary > span").first().boundingBox();
  expect(summaryTime!.y).toBe(sessionTitle!.y);
  expect((await group.locator("summary > span").last().boundingBox())!.y).toBeGreaterThanOrEqual(sessionTitle!.y + sessionTitle!.height);
  await page.screenshot({ path: testInfo.outputPath("team-activity-expanded-reviews.png") });
  const link = group.getByRole("link").first();
  await expect(link).toHaveAttribute("href", /\/projects\/.+\?task=/);
  const scroll = tooltip.locator(":scope > div").first();
  expect(await scroll.evaluate(element => element.scrollHeight > element.clientHeight && element.clientHeight <= window.innerHeight * 0.6)).toBe(true);
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(tooltip).toBeVisible();
  const bounds = await tooltip.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000);
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await cell.focus();
  await expect(cell).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  const details = page.getByRole("dialog", { name: /Review Reviewer/ });
  const pinnedGroup = details.locator(`[data-review-session="${sharedSession}"]`);
  await expect(pinnedGroup).not.toHaveAttribute("open");
  await pinnedGroup.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(pinnedGroup.getByRole("link")).toHaveCount(12);
  await expect(details).toContainText("3:00 год");
  await page.keyboard.press("Escape");
  await expect(cell).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await cell.hover();
  await expect(cell).toHaveCSS("transform", "none");
  await expect(cell).toHaveCSS("transition-property", "none");
  await row.locator('[data-activity-state="missing"]').first().hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator("[data-activity-category]")).toHaveCount(0);
});

test("team activity shows workday states and weekends at Full HD and laptop widths, retaining navigation and details", async ({ page }, testInfo) => {
  const today = instantToDateOnly(new Date().toISOString());
  const month = today.slice(0, 7), previous = shiftActivityMonth(month, -1);
  const dates = Array.from({ length: 28 }, (_, index) => addCalendarDays(`${previous}-01`, index));
  const workdays = dates.filter(date => getWorkdayKind(date, { joinedDate: null }) === "day");
  const weekends = dates.filter(date => getWorkdayKind(date, { joinedDate: null }) === "weekend");
  const [underDate, targetDate, overDate, absenceDate, holidayDate, zeroDate, missingDate, emptyAbsenceDate] = workdays;
  await fixture.service.from("studios").update({ standard_workday_minutes: 420 }).eq("id", fixture.studioId).throwOnError();
  await fixture.service.from("work_log_entries").insert([
    { studio_id: fixture.studioId, user_id: fixture.assignee.id, work_date: today, activity_kind: "task", task_id: fixture.taskId, minutes: 90 },
    { studio_id: fixture.studioId, user_id: fixture.assignee.id, work_date: today, activity_kind: "task", task_id: fixture.fallbackTaskId, minutes: 120 },
    ...[{ date: underDate, minutes: 210 }, { date: targetDate, minutes: 420 }, { date: overDate, minutes: 480 },
      { date: absenceDate, minutes: 60 }, { date: weekends[0], minutes: 60 }].map(({ date, minutes }) => ({
      studio_id: fixture.studioId, user_id: fixture.assignee.id, work_date: date, activity_kind: "task", task_id: fixture.taskId, minutes,
    })),
  ]).throwOnError();
  const absence = await fixture.assignee.client.from("time_off_requests").insert({ studio_id: fixture.studioId, user_id: fixture.assignee.id,
    request_type: "other", private_note: "Activity calendar browser fixture", start_date: absenceDate, end_date: absenceDate, all_day: true,
  }).select("id").single().throwOnError();
  await fixture.admin.client.rpc("approve_time_off_request", { p_request_id: absence.data.id }).throwOnError();
  await fixture.admin.client.from("studio_days_off").insert({ studio_id: fixture.studioId, date: holidayDate, name: "Activity test holiday", created_by: fixture.admin.id }).throwOnError();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: testInfo.project.use.baseURL ?? "http://localhost:3000" }]);
  await signInLocalTestUser(page, fixture.admin);
  // Exercise zero, empty absence and live UI states without creating extra tracking records.
  await page.route("**/api/statistics/team-activity?month=*", async route => {
    const response = await route.fetch();
    if (!response.ok()) { await route.fulfill({ response }); return; }
    const report = teamActivityReportSchema.parse(await response.json());
    const person = report.people.find(person => person.id === fixture.assignee.id);
    const zero = report.month === previous ? person?.days.find(day => day.date === zeroDate) : undefined;
    if (zero) { zero.recorded = true; zero.minutes = 0; }
    const emptyAbsence = report.month === previous ? person?.days.find(day => day.date === emptyAbsenceDate) : undefined;
    if (emptyAbsence) emptyAbsence.kind = "time_off";
    const current = person?.days.find(day => day.date === today);
    const task = current?.items[0]?.task;
    if (current && task) current.runningTasks = [task];
    await route.fulfill({ response, json: report });
  });
  await page.goto("/statistics?section=team&period=3");
  const calendar = page.locator("#stats-team-activity");
  await expect(calendar.getByRole("heading", { name: uk.Statistics.activityTitle })).toBeVisible();
  const row = calendar.getByRole("row").filter({ hasText: "Review Assignee" });
  const cell = row.locator(`[data-activity-date="${today}"]`);
  await expect(cell).toHaveAttribute("aria-label", /3:30 год/);
  await expect(cell.getByTestId("activity-running")).toBeVisible();
  const legend = calendar.getByTestId("activity-legend");
  await expect(legend.locator(":scope > span")).toHaveText([
    uk.Statistics.activityMissing, uk.Statistics.activityState_under, uk.Statistics.activityState_target,
    uk.Statistics.activityState_over, uk.Statistics.activityState_worked,
    uk.Statistics.activityDay_weekend, uk.Statistics.activityDay_time_off, uk.Statistics.activityTimezone,
  ]);
  await cell.hover();
  await expect(page.getByRole("tooltip")).toContainText("Review lifecycle task");
  await expect(page.getByRole("tooltip")).toContainText("Review without client step");
  await page.mouse.move(0, 0);
  await cell.focus();
  await expect(page.getByRole("tooltip")).toContainText("Review rounds project");
  await cell.click();
  const details = page.getByRole("dialog", { name: /Review Assignee/ });
  await expect(details).toContainText("3:30 год");
  await expect(details.getByRole("link")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(cell).toBeFocused();

  await calendar.getByRole("button", { name: uk.Statistics.activityPreviousMonth, exact: true }).click();
  for (const [date, state] of [[underDate, "under"], [targetDate, "target"], [overDate, "over"], [absenceDate, "worked"], [holidayDate, "excused"], [weekends[0], "worked"], [weekends[1], "excused"]]) {
    await expect(row.locator(`[data-activity-date="${date}"]`)).toHaveAttribute("data-activity-state", state);
  }
  await expect(row.locator(`[data-activity-date="${absenceDate}"]`)).toHaveAttribute("data-day-kind", "time_off");
  await expect(row.locator(`[data-activity-date="${holidayDate}"]`)).toHaveAttribute("data-day-kind", "studio_day_off");
  await expect(row.locator(`[data-activity-date="${weekends[0]}"]`)).toHaveAttribute("data-weekend", "true");
  await expect(row.locator(`[data-activity-date="${weekends[0]}"] svg`)).toHaveCount(0);
  const emptyWeekend = row.locator(`[data-activity-date="${weekends[1]}"]`);
  const weekendMark = emptyWeekend.locator("span[aria-hidden='true']").first();
  expect(await weekendMark.evaluate(element => ({ border: getComputedStyle(element).borderStyle, fill: getComputedStyle(element).backgroundColor })))
    .toEqual({ border: "solid", fill: "rgba(0, 0, 0, 0)" });
  await expect(weekendMark.locator("*")).toHaveCount(0);
  const emptyAbsence = row.locator(`[data-activity-date="${emptyAbsenceDate}"]`);
  await expect(emptyAbsence).toHaveAttribute("data-activity-state", "excused");
  const absenceAppearance = await emptyAbsence.locator("span[aria-hidden='true']").first().evaluate(element => ({
    border: getComputedStyle(element).borderStyle, fill: getComputedStyle(element).backgroundColor,
  }));
  expect(absenceAppearance.border).toBe("dashed");
  expect(absenceAppearance.fill).not.toBe("rgba(0, 0, 0, 0)");
  const activityAppearances = await Promise.all([missingDate, underDate, targetDate, overDate, weekends[0]].map(date =>
    row.locator(`[data-activity-date="${date}"] span[aria-hidden='true']`).first().evaluate(element => ({
      border: getComputedStyle(element).borderWidth, fill: getComputedStyle(element).backgroundColor,
    }))));
  expect(activityAppearances.every(appearance => appearance.border === "0px" && appearance.fill !== "rgba(0, 0, 0, 0)")).toBe(true);
  expect(new Set(activityAppearances.map(appearance => appearance.fill)).size).toBe(5);
  const zero = row.locator(`[data-activity-date="${zeroDate}"]`);
  await expect(zero).toHaveAttribute("data-activity-state", "under");
  await expect(zero.locator("span[aria-hidden='true']").first()).toHaveClass(await row.locator(`[data-activity-date="${underDate}"] span[aria-hidden='true']`).first().getAttribute("class") ?? "");
  await zero.focus();
  await expect(page.getByRole("tooltip")).toContainText("0:00 год");
  await expect(page.getByRole("tooltip")).toContainText(uk.Statistics.activityState_under);
  await expect(row.locator(`[data-activity-date="${missingDate}"]`)).toHaveAttribute("data-activity-state", "missing");
  await emptyWeekend.focus();
  await expect(page.getByRole("tooltip")).toContainText(uk.Statistics.activityDay_weekend);
  const absenceCell = row.locator(`[data-activity-date="${absenceDate}"]`);
  await absenceCell.focus();
  await expect(page.getByRole("tooltip")).toContainText(uk.Statistics.activityDay_time_off);
  await expect(page.getByRole("tooltip")).toContainText("1:00 год");
  await page.keyboard.press("Escape");
  await expect(row.getByRole("rowheader").locator("span[aria-hidden='true']").first()).toContainText("RA");
  const scroller = calendar.getByTestId("activity-scroll");
  expect(await scroller.evaluate(element => Math.abs(element.clientWidth - element.querySelector("table")!.getBoundingClientRect().width - 32) < 2)).toBe(true);
  expect((await row.locator(`[data-activity-date="${underDate}"]`).boundingBox())?.width).toBe(36);
  await calendar.screenshot({ path: testInfo.outputPath("team-activity-full-hd.png") });

  await page.setViewportSize({ width: 1024, height: 768 });
  expect((await row.locator(`[data-activity-date="${underDate}"]`).boundingBox())?.width).toBe(28);
  expect(await scroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  const name = row.getByRole("rowheader");
  await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  const scrollerBounds = await scroller.boundingBox(), nameBounds = await name.boundingBox();
  expect(nameBounds?.x).toBeGreaterThanOrEqual(scrollerBounds?.x ?? 0);
  expect(nameBounds?.x).toBeLessThan((scrollerBounds?.x ?? 0) + 20);
  await expect(name).toBeVisible();
  await scroller.evaluate(element => { element.scrollLeft = 0; });
  await calendar.screenshot({ path: testInfo.outputPath("team-activity-laptop.png") });
  await calendar.getByRole("button", { name: uk.Statistics.activityNextMonth, exact: true }).click();
  await expect(cell).toBeVisible();
  await calendar.getByRole("button", { name: uk.Statistics.activityNextMonth, exact: true }).click();
  const next = shiftActivityMonth(month, 1);
  await expect(row.locator(`[data-activity-date="${next}-01"]`)).toBeVisible();
  await calendar.getByRole("button", { name: uk.Statistics.activityToday, exact: true }).click();
  await expect(cell).toHaveAttribute("aria-label", /3:30 год/);
  expect(await row.locator("button[data-activity-date]").count()).toBe(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.request.get(`/api/statistics/team-activity?month=${month}`)).status()).toBe(200);
  expect((await page.request.get("/api/statistics/team-activity?month=invalid")).status()).toBe(400);
  await signInLocalTestUser(page, fixture.assignee);
  expect((await page.request.get(`/api/statistics/team-activity?month=${month}`)).status()).toBe(403);
});
