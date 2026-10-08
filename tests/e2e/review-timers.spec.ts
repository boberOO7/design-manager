import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../helpers/task-review-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import uk from "../../messages/uk.json";

let fixture: TaskReviewFixture;

test.beforeEach(async () => { fixture = await createTaskReviewFixture(); });
test.afterEach(async () => { if (fixture) await fixture.dispose(); });

async function createReviewRounds(count: number) {
  const { admin, assignee, reviewer, projectId } = fixture;
  const taskIds = Array.from({ length: count }, () => randomUUID());
  const values = taskIds.map((id, index) => `(${sqlId(id)},${sqlId(projectId)},'Timer review ${index + 1}','stage_1','in_progress','normal',${sqlId(assignee.id)},${sqlId(admin.id)})`).join(",");
  reviewSql(`insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values ${values};`);
  for (const taskId of taskIds) {
    await admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "configure", p_reviewer_ids: [reviewer.id] }).throwOnError();
    await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
  }
  const rounds = await fixture.service.from("task_review_rounds").select("id,task_id,round_number").in("task_id", taskIds).order("round_number").throwOnError();
  expect(rounds.data).toHaveLength(count);
  return rounds.data;
}

async function openQueue(page: Page, reviewer = fixture.reviewer) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://127.0.0.1:3000" }]);
  await signInLocalTestUser(page, reviewer);
  await page.goto("/my-tasks?view=review");
  return page.getByRole("list", { name: uk.Tasks.reviewQueue });
}

async function backdateActiveSession(sessionId: string, minutes: number) {
  reviewSql(`update public.review_timer_sessions set accounted_at=clock_timestamp()-interval '${minutes} minutes' where id=${sqlId(sessionId)} and state='active';`);
}

async function timerSnapshot(page: Page) {
  const response = await page.request.get("/api/review-timers");
  expect(response.ok()).toBe(true);
  return await response.json() as { sessions: Array<{ id: string; state: string; elapsed_us: number; members: Array<{ round_id: string; finished_at: string | null }> }> };
}

test("review island preserves paused individual and group work across resumes, routes and tabs", async ({ page }) => {
  const queue = await openQueue(page);
  const island = page.getByRole("banner").locator("[data-review-island]");
  const time = island.locator("[data-active-review-elapsed]");
  const toggle = island.locator("[data-review-island-toggle]");
  const details = island.locator("[data-review-island-details]");
  const other = await page.context().newPage();
  try {
    await other.goto("/dashboard");
    const otherIsland = other.getByRole("banner").locator("[data-review-island]");
    for (const count of [1, 2]) {
      const rounds = await createReviewRounds(count);
      const ids = rounds.map(round => round.id).sort();
      await page.goto("/my-tasks?view=review");
      const group = count === 2;
      const target = group ? queue.locator("[data-review-group]") : queue.locator(`[data-review-row="${ids[0]}"]`);
      await target.getByRole("button", { name: uk.ReviewTimer[group ? "startGroup" : "start"], exact: true }).click();
      await expect(island).toHaveAttribute("data-state", "active");
      await expect(otherIsland).toHaveAttribute("data-state", "active");
      for (const cycle of [0, 1]) {
        const surface = await island.elementHandle();
        if (!surface) throw new Error("Expected review island");
        const active = (await timerSnapshot(page)).sessions.find(session => session.state === "active");
        if (!active) throw new Error("Expected running review");
        expect(active.members.map(member => member.round_id).sort()).toEqual(ids);
        await backdateActiveSession(active.id, 1);
        // Exercise the collapsed control first, then the expanded control.
        if (cycle === 1) await toggle.click();
        await island.getByRole("button", { name: uk.ReviewTimer.pause, exact: true }).click();
        await expect(island).toHaveAttribute("data-state", "paused");
        await expect(otherIsland).toHaveAttribute("data-state", "paused");
        await expect(island.getByRole("button", { name: uk.ReviewTimer.resume, exact: true })).toBeVisible();
        expect(await surface.evaluate(element => element === document.querySelector("[data-review-island]"))).toBe(true);
        if (cycle === 1) {
          await expect(toggle).toHaveAttribute("aria-expanded", "true");
          await expect(island).toContainText(uk.ReviewTimer[group ? "groupPaused" : "reviewPaused"]);
        }
        const frozen = await time.textContent();
        const paused = await timerSnapshot(page);
        const total = paused.sessions.filter(session => session.members.some(member => ids.includes(member.round_id)))
          .reduce((sum, session) => sum + session.elapsed_us, 0);
        await page.waitForTimeout(1500);
        await expect(time).toHaveText(frozen ?? "");
        const stillPaused = (await timerSnapshot(page)).sessions.find(session => session.id === active.id);
        expect(stillPaused?.elapsed_us).toBe(paused.sessions.find(session => session.id === active.id)?.elapsed_us);
        expect(stillPaused?.state).toBe("paused");

        if (cycle === 0) {
          // New queue arrivals must not enter the paused group's frozen membership.
          if (group) await createReviewRounds(1);
          await page.locator('aside a[href="/dashboard"]').last().click();
          await expect(page).toHaveURL(/\/dashboard$/);
          await expect(island).toHaveAttribute("data-state", "paused");
          await expect(time).toHaveText(frozen ?? "");
          await page.reload();
          await expect(island).toHaveAttribute("data-state", "paused");
          await expect(time).toHaveText(frozen ?? "");
          await toggle.click();
          await expect(island).toContainText(uk.ReviewTimer[group ? "groupPaused" : "reviewPaused"]);
          // Resume in a different tab, retaining the main tab's expanded surface.
          await otherIsland.getByRole("button", { name: uk.ReviewTimer.resume, exact: true }).click();
        } else {
          await details.getByRole("button", { name: uk.ReviewTimer.resume, exact: true }).click();
        }
        await expect(island).toHaveAttribute("data-state", "active");
        await expect(otherIsland).toHaveAttribute("data-state", "active");
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        const resumed = await timerSnapshot(page);
        expect(resumed.sessions.filter(session => session.state === "active")).toHaveLength(1);
        expect(resumed.sessions.find(session => session.state === "active")?.members.map(member => member.round_id).sort()).toEqual(ids);
        const history = resumed.sessions.filter(session => session.members.some(member => ids.includes(member.round_id)));
        expect(history).toHaveLength(cycle + 2);
        expect(history.reduce((sum, session) => sum + session.elapsed_us, 0)).toBeGreaterThanOrEqual(total);
        const resumedTime = await time.textContent();
        expect(resumedTime && frozen && resumedTime >= frozen).toBe(true);
        await expect.poll(() => time.textContent()).not.toBe(resumedTime);
        await page.keyboard.press("Escape");
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        // Returning through the island also checks its context after resume.
        await toggle.click();
        await details.getByRole("link").click();
        await expect(page).toHaveURL(/\/my-tasks\?view=review/);
        if (!group) {
          // The individual Open Review action opens local details.
          const drawer = page.getByRole("dialog");
          await expect(drawer).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(drawer).toHaveCount(0);
        }
      }
      const last = (await timerSnapshot(page)).sessions.find(session => session.state === "active");
      if (!last) throw new Error("Expected final running interval");
      await backdateActiveSession(last.id, 1);
      if (group) {
        await target.getByRole("button", { name: uk.ReviewTimer.sendBackGroup, exact: true }).click();
        const dialog = page.getByRole("dialog", { name: uk.ReviewTimer.sendBackGroup });
        await dialog.getByRole("textbox", { name: uk.Tasks.reviewFixComment }).fill("Уточнити деталі");
        await dialog.getByRole("button", { name: uk.Tasks.reviewConfirmRework, exact: true }).click();
        await expect(dialog).toHaveCount(0);
      } else {
        // Approval while paused must dismiss the persistent island too.
        await island.getByRole("button", { name: uk.ReviewTimer.pause, exact: true }).click();
        await expect(island).toHaveAttribute("data-state", "paused");
        await target.getByRole("button", { name: uk.Tasks.reviewApprove, exact: true }).click();
      }
      await expect(island).toHaveCount(0);
      await expect(otherIsland).toHaveCount(0);
      await page.reload();
      await expect(island).toHaveCount(0);
      const finished = await timerSnapshot(page);
      expect(finished.sessions.filter(session => session.state === "active")).toHaveLength(0);
      expect(finished.sessions.find(session => session.id === last.id)?.state).toBe("completed");
      const results = await fixture.service.from("task_review_rounds").select("result").in("id", ids).throwOnError();
      expect(results.data.every(round => round.result === (group ? "rework" : "approved"))).toBe(true);
      const entries = await fixture.service.from("work_log_entries").select("minutes").in("review_round_id", ids).throwOnError();
      expect(entries.data.reduce((sum, entry) => sum + entry.minutes, 0)).toBe(3);
    }
    const days = await fixture.service.from("work_log_days").select("work_date").eq("user_id", fixture.reviewer.id).throwOnError();
    expect(days.data).toEqual([]);
  } finally { await other.close(); }
});

test("review timer island morphs without shifting the header and shares state across routes and tabs", async ({ page }) => {
  const rounds = await createReviewRounds(2);
  const queue = await openQueue(page);
  const group = queue.locator("[data-review-group]");
  const header = page.getByRole("banner");
  const island = header.locator("[data-review-island]");
  const toggle = island.locator("[data-review-island-toggle]");
  const details = island.locator("[data-review-island-details]");
  const headerHeight = (await header.boundingBox())?.height;
  const headerActions = header.locator("[data-header-main-controls]");
  const actionsBeforeStart = await headerActions.boundingBox();
  await group.getByRole("button", { name: uk.ReviewTimer.startGroup, exact: true }).click();
  await expect(island).toHaveCount(1);
  await expect(page.locator("#main-content [data-active-review-timer]")).toHaveCount(0);
  await expect(island).toHaveAttribute("data-expanded", "false");
  await expect(island).toHaveCSS("height", "36px");
  await expect(details).toHaveAttribute("inert", "");
  expect(await headerActions.boundingBox()).toEqual(actionsBeforeStart);
  const collapsedHeight = (await island.boundingBox())?.height ?? 0;
  const surface = await island.elementHandle();
  if (!surface) throw new Error("Expected island surface");
  const heights = await island.evaluate(async element => {
    const button = element.querySelector<HTMLButtonElement>("[data-review-island-toggle]");
    if (!button) throw new Error("Expected island toggle");
    button.click();
    const samples: number[] = [];
    for (let frame = 0; frame < 22; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      samples.push(element.getBoundingClientRect().height);
    }
    return samples;
  });
  const expandedHeight = heights.at(-1) ?? 0;
  expect(expandedHeight).toBeGreaterThan(collapsedHeight + 80);
  expect(heights.some(height => height > collapsedHeight + 2 && height < expandedHeight - 2)).toBe(true);
  expect(await surface.evaluate(element => element === document.querySelector("[data-review-island]"))).toBe(true);
  await expect(island).toContainText(uk.ReviewTimer.groupInProgress);
  await expect(details).toContainText("Review rounds project");
  await expect(details).toContainText("Етап 1");
  await expect(details).toContainText("2 перевірок");
  await expect(details.getByRole("button", { name: uk.ReviewTimer.pause, exact: true })).toBeVisible();
  await expect(details.getByRole("link")).toBeVisible();
  expect(await headerActions.boundingBox()).toEqual(actionsBeforeStart);
  const time = island.locator("[data-active-review-elapsed]");
  const initialTime = await time.textContent();
  const timeWidth = (await time.boundingBox())?.width;
  await expect.poll(() => time.textContent()).not.toBe(initialTime);
  expect((await time.boundingBox())?.width).toBe(timeWidth);
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(island).toHaveCSS("height", "36px");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("heading", { name: uk.Tasks.myTasks, exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(island).toHaveCSS("height", "36px");

  // Layout checks share this live session and do not start extra timers.
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const assertLayout = async () => {
      expect((await header.boundingBox())?.height).toBe(headerHeight);
      const bounds = await island.boundingBox();
      const headerBounds = await header.boundingBox();
      if (!bounds || !headerBounds) throw new Error("Expected header and island bounds");
      expect(Math.abs(bounds.x + bounds.width / 2 - headerBounds.x - headerBounds.width / 2)).toBeLessThan(1);
      await expect.poll(() => header.evaluate(element => {
        const island = element.querySelector("[data-review-island]")?.getBoundingClientRect();
        if (!island) return ["missing island"];
        const controls = element.querySelectorAll("[data-header-main-controls] > button, [data-header-main-controls] > div:not([data-work-log-reminder]) > button, [data-header-identity]");
        return [...controls].flatMap(control => {
          const box = control.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.left < island.right && box.right > island.left && box.top < island.bottom && box.bottom > island.top
            ? [{ control: control.textContent, controlBounds: box.toJSON(), islandBounds: island.toJSON() }] : [];
        });
      })).toEqual([]);
      expect(bounds.x).toBeGreaterThanOrEqual(headerBounds.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(headerBounds.x + headerBounds.width);
    };
    await assertLayout();
    const controlsBefore = await headerActions.boundingBox();
    const contentBefore = await page.locator("#main-content").boundingBox();
    await toggle.click();
    await expect(details).toHaveCSS("opacity", "1");
    await assertLayout();
    expect(await headerActions.boundingBox()).toEqual(controlsBefore);
    expect(await page.locator("#main-content").boundingBox()).toEqual(contentBefore);
    if (width === 1440 || width === 390) await page.screenshot({ path: `/tmp/studioflow-review-island-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(details).toHaveCSS("visibility", "hidden");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedHeights = await island.evaluate(async element => {
    element.querySelector<HTMLButtonElement>("[data-review-island-toggle]")?.click();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const first = element.getBoundingClientRect().height;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return [first, element.getBoundingClientRect().height];
  });
  expect(reducedHeights[0]).toBeGreaterThan(100);
  expect(reducedHeights[0]).toBe(reducedHeights[1]);
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const active = (await timerSnapshot(page)).sessions.find(session => session.state === "active");
  if (!active) throw new Error("Expected shared timer");
  expect(active.members.map(member => member.round_id).sort()).toEqual(rounds.map(round => round.id).sort());
  await page.locator('aside a[href="/dashboard"]').last().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(island).toBeVisible();
  await page.goto("/projects");
  await page.reload();
  await expect(island).toBeVisible();
  expect((await timerSnapshot(page)).sessions.find(session => session.state === "active")?.id).toBe(active.id);
  await toggle.click();
  await details.getByRole("link").click();
  await expect(page).toHaveURL(/\/my-tasks\?view=review&reviewGroup=/);
  await expect(group.locator("[data-review-group-toggle]")).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const other = await page.context().newPage();
  try {
    await other.goto("/dashboard");
    const otherIsland = other.getByRole("banner").locator("[data-review-island]");
    await expect(otherIsland).toBeVisible();
    await backdateActiveSession(active.id, 3);
    await otherIsland.locator("[data-review-island-toggle]").click();
    await otherIsland.locator("[data-review-island-details]").getByRole("button", { name: uk.ReviewTimer.pause, exact: true }).click();
    await expect(otherIsland).toHaveAttribute("data-state", "paused");
    await expect(island).toHaveAttribute("data-state", "paused");
  } finally { await other.close(); }
  expect((await timerSnapshot(page)).sessions.find(session => session.id === active.id)?.state).toBe("paused");
  await expect(group.getByRole("button", { name: uk.ReviewTimer.resumeGroup, exact: true })).toBeVisible();
  const entries = await fixture.service.from("work_log_entries").select("minutes").eq("user_id", fixture.reviewer.id).throwOnError();
  expect(entries.data.reduce((sum, entry) => sum + entry.minutes, 0)).toBe(3);
  const days = await fixture.service.from("work_log_days").select("work_date").eq("user_id", fixture.reviewer.id).throwOnError();
  expect(days.data).toEqual([]);
});

for (const action of ["approved", "rework"] as const) {
  test(`group workspace bulk ${action} keeps actions aligned, persists its reminder and accounts shared time once`, async ({ page }) => {
    const rounds = await createReviewRounds(10);
    const queue = await openQueue(page);
    const group = queue.locator("[data-review-group]");
    const actions = group.locator("[data-review-group-actions]");
    const header = group.locator(":scope > div").first();
    const initialHeight = (await header.boundingBox())?.height;
    await group.getByRole("button", { name: uk.ReviewTimer.startGroup, exact: true }).click();
    const reminder = page.locator("[data-active-review-timer]");
    await expect(reminder.locator("[data-review-island-toggle]")).toHaveAttribute("aria-label", new RegExp(uk.ReviewTimer.expandTimer));
    await expect(reminder).toContainText("Review rounds project");
    await expect(reminder.locator("[data-active-review-elapsed]")).toHaveText(/\d{2}:\d{2}:\d{2}/);
    const firstTime = await reminder.locator("[data-active-review-elapsed]").textContent();
    await expect.poll(() => reminder.locator("[data-active-review-elapsed]").textContent()).not.toBe(firstTime);
    const first = (await timerSnapshot(page)).sessions.find(session => session.state === "active");
    if (!first) throw new Error("Expected active group session");
    expect(first.members.map(member => member.round_id).sort()).toEqual(rounds.map(round => round.id).sort());
    await page.reload();
    await expect(reminder).toBeVisible();
    expect((await timerSnapshot(page)).sessions.find(session => session.state === "active")?.id).toBe(first.id);
    await expect(actions.getByRole("button", { name: uk.ReviewTimer.pauseGroup, exact: true })).toBeVisible();
    await expect(actions.getByRole("button", { name: uk.ReviewTimer.approveGroup, exact: true })).toBeVisible();
    await expect(actions.getByRole("button", { name: uk.ReviewTimer.sendBackGroup, exact: true })).toBeVisible();
    for (const width of [1440, 2553]) {
      await page.setViewportSize({ width, height: 1000 });
      const bounds = await actions.getByRole("button").evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect(); return { y: rect.y, height: rect.height };
      }));
      expect(bounds).toHaveLength(3);
      expect(Math.max(...bounds.map(box => box.y)) - Math.min(...bounds.map(box => box.y))).toBeLessThanOrEqual(1);
      expect(await actions.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect((await header.boundingBox())?.height).toBe(initialHeight);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await queue.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await reminder.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(actions).toHaveCSS("flex-wrap", "nowrap");
    await page.setViewportSize({ width: 1440, height: 520 });
    await reminder.locator("[data-review-island-toggle]").click();
    await reminder.getByRole("link").click();
    await expect(group.locator("[data-review-group-toggle]")).toHaveAttribute("aria-expanded", "true");
    const individualActions = group.locator("[data-review-actions]").first();
    const rowActionTops = await individualActions.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().y));
    expect(rowActionTops).toHaveLength(3);
    expect(Math.max(...rowActionTops) - Math.min(...rowActionTops)).toBeLessThanOrEqual(1);
    await expect.poll(async () => (await group.locator(":scope > div[aria-hidden='false']").boundingBox())?.height ?? 0).toBeGreaterThan(600);
    const reminderTop = (await reminder.boundingBox())?.y;
    await page.locator("#main-content").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(reminder).toBeInViewport();
    await expect.poll(async () => (await reminder.boundingBox())?.y).toBe(reminderTop);
    await reminder.locator("[data-review-island-toggle]").click();
    await reminder.getByRole("link").click();
    await expect(actions).toBeInViewport();
    await group.locator("[data-review-group-toggle]").click();
    await expect(group.locator("[data-review-group-toggle]")).toHaveAttribute("aria-expanded", "false");
    await expect(reminder).toBeVisible();

    await backdateActiveSession(first.id, 6);
    await actions.getByRole("button", { name: uk.ReviewTimer.pauseGroup, exact: true }).click();
    await expect(reminder).toHaveAttribute("data-state", "paused");
    expect((await timerSnapshot(page)).sessions.find(session => session.id === first.id)?.state).toBe("paused");
    await actions.getByRole("button", { name: uk.ReviewTimer.resumeGroup, exact: true }).click();
    await expect(reminder).toBeVisible();
    await expect(reminder.locator("[data-active-review-elapsed]")).toHaveText(/^00:06:/);
    const resumed = (await timerSnapshot(page)).sessions.find(session => session.state === "active");
    if (!resumed) throw new Error("Expected resumed group session");
    expect(resumed.id).not.toBe(first.id);
    // A review submitted after Start is visible in the same group but outside frozen membership.
    const [waiting] = await createReviewRounds(1);
    if (!waiting) throw new Error("Expected newly queued review");
    await page.reload();
    await expect(group).toContainText("11 перевірок");
    await backdateActiveSession(resumed.id, 3);
    if (action === "approved") {
      await actions.getByRole("button", { name: uk.ReviewTimer.approveGroup, exact: true }).click();
    } else {
      await actions.getByRole("button", { name: uk.ReviewTimer.sendBackGroup, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: uk.ReviewTimer.sendBackGroup });
      const confirm = dialog.getByRole("button", { name: uk.Tasks.reviewConfirmRework, exact: true });
      await expect(confirm).toBeDisabled();
      await expect(dialog).toContainText("10 перевірок");
      await dialog.getByRole("textbox", { name: uk.Tasks.reviewFixComment }).fill("Уточнити деталі групи");
      await confirm.click();
      await expect(dialog).toHaveCount(0);
    }
    await expect(page.locator("[data-review-row]")).toHaveCount(1);
    await expect(page.locator(`[data-review-row="${waiting.id}"]`)).toContainText(uk.ReviewTimer.waiting);
    await expect(reminder).toHaveCount(0);
    const snapshot = await timerSnapshot(page);
    expect(snapshot.sessions.filter(session => session.state === "active")).toHaveLength(0);
    expect(snapshot.sessions.find(session => session.id === resumed.id)?.members.every(member => member.finished_at !== null)).toBe(true);
    const results = await fixture.service.from("task_review_rounds").select("result,rework_comment").in("id", rounds.map(round => round.id)).throwOnError();
    expect(results.data.every(round => round.result === action)).toBe(true);
    if (action === "rework") {
      expect(results.data.every(round => round.rework_comment === "Уточнити деталі групи")).toBe(true);
      expect(reviewSql(`select count(*) from public.tasks where id in (${rounds.map(round => sqlId(round.task_id)).join(",")}) and status='in_progress'`)).toBe("10");
    }
    const entries = await fixture.service.from("work_log_entries").select("minutes,review_round_id").eq("user_id", fixture.reviewer.id).eq("activity_kind", "review").throwOnError();
    expect(entries.data.reduce((sum, entry) => sum + entry.minutes, 0)).toBe(9);
    expect(entries.data.every(entry => rounds.some(round => round.id === entry.review_round_id))).toBe(true);
    const daily = await fixture.service.from("review_timer_daily").select("round_id,work_date,minutes").eq("user_id", fixture.reviewer.id).throwOnError();
    expect(daily.data.reduce((sum, entry) => sum + entry.minutes, 0)).toBe(9);
    expect([...new Set(daily.data.map(entry => entry.round_id))].sort()).toEqual(rounds.map(round => round.id).sort());
    for (const date of new Set(daily.data.map(entry => entry.work_date))) {
      const minutes = daily.data.filter(entry => entry.work_date === date).map(entry => entry.minutes);
      expect(minutes).toHaveLength(10);
      expect(Math.max(...minutes) - Math.min(...minutes)).toBeLessThanOrEqual(1);
    }
    const submitted = await fixture.service.from("work_log_days").select("work_date").eq("studio_id", fixture.studioId).eq("user_id", fixture.reviewer.id).throwOnError();
    expect(submitted.data).toEqual([]);
    await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
    const log = page.getByRole("dialog", { name: uk.WorkLog.title });
    await expect(log.locator("[data-work-log-row]")).not.toHaveCount(0);
    await expect(log.locator(`[data-work-log-row="review:${waiting.id}"]`)).toHaveCount(0);
    await log.getByRole("button", { name: uk.WorkLog.close, exact: true }).click();
  });
}

test("individual review timer survives refresh, accumulates into Work Log, and preserves manual edits", async ({ page }) => {
  const [round] = await createReviewRounds(1);
  if (!round) throw new Error("Expected review round");
  const queue = await openQueue(page);
  const row = queue.locator(`[data-review-row="${round.id}"]`);
  await expect(row).toBeVisible();
  await expect(queue).not.toContainText("Review Reviewer");
  await expect(row).toContainText("Review Assignee");
  await expect(row).toContainText("Review #1");
  const rowBounds = await row.boundingBox();
  if (!rowBounds) throw new Error("Expected review row bounds");
  await row.click({ position: { x: rowBounds.width / 2, y: rowBounds.height - 2 } });
  const drawer = page.getByRole("dialog", { name: uk.Tasks.taskDetails });
  await expect(drawer.locator("#task-details-title")).toHaveText("Timer review 1");
  await expect(drawer).toHaveCount(1);
  await expect(page).toHaveURL(/\/my-tasks\?view=review$/);
  await drawer.getByRole("button", { name: uk.Tasks.closeTaskDetails, exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await row.locator("[data-review-open]").focus();
  await row.locator("[data-review-open]").press("Enter");
  await expect(drawer.locator("#task-details-title")).toHaveText("Timer review 1");
  await expect(drawer).toHaveCount(1);
  await drawer.getByRole("button", { name: uk.Tasks.closeTaskDetails, exact: true }).click();
  await expect(drawer).toHaveCount(0);
  const projectLink = row.getByRole("link", { name: uk.Tasks.goToProject, exact: true });
  await expect(projectLink).toHaveAttribute("href", `/projects/${fixture.projectId}?task=${round.task_id}`);
  await projectLink.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${fixture.projectId}\\?task=${round.task_id}$`));
  await page.goto("/my-tasks?view=review");
  await row.getByRole("button", { name: uk.ReviewTimer.start, exact: true }).click();
  await expect(page.getByRole("dialog", { name: uk.Tasks.taskDetails })).toHaveCount(0);
  await expect(row).toContainText(uk.ReviewTimer.active);
  let snapshot = await timerSnapshot(page);
  const first = snapshot.sessions.find(session => session.state === "active");
  if (!first) throw new Error("Expected active review timer");
  expect(first.members.map(member => member.round_id)).toEqual([round.id]);
  await page.reload();
  const refreshedRow = page.locator(`[data-review-row="${round.id}"]`);
  await expect(refreshedRow).toContainText(uk.ReviewTimer.active);
  await expect(refreshedRow.locator("[data-review-elapsed]")).toBeVisible();
  await expect(refreshedRow.locator("[data-review-elapsed]")).toHaveText(/00:00:[0-9]{2}/);
  await backdateActiveSession(first.id, 3);
  await refreshedRow.getByRole("button", { name: uk.ReviewTimer.pause, exact: true }).click();
  await expect(refreshedRow).toContainText(uk.ReviewTimer.paused);
  snapshot = await timerSnapshot(page);
  expect(snapshot.sessions.find(session => session.id === first.id)?.state).toBe("paused");
  await expect(refreshedRow.locator("[data-review-elapsed]")).toHaveText("00:03:00");
  const timerOnlySubmissions = await fixture.service.from("work_log_days").select("work_date").eq("studio_id", fixture.studioId).eq("user_id", fixture.reviewer.id).throwOnError();
  expect(timerOnlySubmissions.data).toEqual([]);

  // Work Log editing changes the visible total while its timer baseline remains separate.
  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  const log = page.getByRole("dialog", { name: uk.WorkLog.title });
  const workRow = log.locator(`[data-work-log-row="review:${round.id}"]`);
  await expect(workRow.locator("[data-work-log-duration]")).toHaveText("00:03");
  await workRow.locator("[data-work-log-duration]").click();
  await log.getByRole("listbox", { name: "Години", exact: true }).getByRole("option", { name: "00", exact: true }).click();
  await log.getByRole("listbox", { name: "Хвилини", exact: true }).getByRole("option", { name: "05", exact: true }).click();
  await workRow.locator("[data-work-log-duration]").click();
  const saved = page.waitForResponse(response => response.url().includes("/api/work-log") && response.request().method() === "PUT");
  await log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await log.getByRole("button", { name: uk.WorkLog.close, exact: true }).click();

  await page.goto("/my-tasks?view=review");
  const paused = page.locator(`[data-review-row="${round.id}"]`);
  await paused.getByRole("button", { name: uk.ReviewTimer.resume, exact: true }).click();
  await expect(paused).toContainText(uk.ReviewTimer.active);
  snapshot = await timerSnapshot(page);
  const resumed = snapshot.sessions.find(session => session.state === "active");
  if (!resumed) throw new Error("Expected resumed review timer");
  expect(resumed.id).not.toBe(first.id);
  expect(resumed.members.map(member => member.round_id)).toEqual([round.id]);
  await backdateActiveSession(resumed.id, 2);
  await paused.getByRole("button", { name: uk.Tasks.reviewApprove, exact: true }).click();
  await expect(page.locator(`[data-review-row="${round.id}"]`)).toHaveCount(0);
  const logged = await fixture.service.from("work_log_entries").select("minutes,review_round_id,user_id").eq("review_round_id", round.id).eq("user_id", fixture.reviewer.id).throwOnError();
  expect(logged.data).toEqual([{ minutes: 7, review_round_id: round.id, user_id: fixture.reviewer.id }]);
});

test("group queue is aligned and collapsed; one shared timer allocates exact time and safely closes a member", async ({ page }) => {
  const rounds = await createReviewRounds(10);
  const assigneeName = "Владислава Шевченко-Литвиненко";
  await fixture.service.from("profiles").update({ full_name: assigneeName }).eq("id", fixture.assignee.id).throwOnError();
  const queue = await openQueue(page);
  const group = queue.locator("[data-review-group]");
  await expect(group).toHaveCount(1);
  const toggle = group.locator("[data-review-group-toggle]");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(group).toContainText("Review rounds project");
  await expect(group).toContainText("10 перевірок");
  const collapsed = group.locator(":scope > div[aria-hidden='true']");
  await expect(collapsed).toHaveAttribute("inert", "");
  await expect(collapsed).toHaveCSS("height", "0px");
  for (const width of [2553, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const headerBounds = await group.locator(":scope > div").first().boundingBox();
    const toggleBounds = await toggle.boundingBox();
    if (!headerBounds || !toggleBounds) throw new Error("Expected group header bounds");
    expect(Math.abs(toggleBounds.y - headerBounds.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(toggleBounds.height - headerBounds.height)).toBeLessThanOrEqual(1);
    await toggle.click({ position: { x: toggleBounds.width / 2, y: 2 } });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const row = queue.locator("[data-review-row]").first();
    const readableName = await row.getByText(assigneeName, { exact: true }).evaluate(element =>
      element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight);
    expect(readableName).toBe(true);
    const priorityBounds = await row.locator(":scope > span").boundingBox();
    const stateBounds = await row.locator(":scope > div").nth(3).boundingBox();
    if (!priorityBounds || !stateBounds) throw new Error("Expected priority and state columns");
    expect(priorityBounds.x + priorityBounds.width).toBeLessThan(stateBounds.x);
    await toggle.click({ position: { x: toggleBounds.width / 2, y: toggleBounds.height - 2 } });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  await toggle.click();
  const grid = await page.evaluate(() => {
    const row = document.querySelector("[data-review-row]");
    const groupHeader = document.querySelector("[data-review-group] > div");
    return row && groupHeader ? [getComputedStyle(row).gridTemplateColumns, getComputedStyle(groupHeader).gridTemplateColumns] : null;
  });
  expect(grid?.[0]).toBe(grid?.[1]);
  await group.getByRole("button", { name: uk.ReviewTimer.startGroup, exact: true }).click();
  await expect(group.locator("[data-review-group-elapsed]")).toBeVisible();
  let snapshot = await timerSnapshot(page);
  const session = snapshot.sessions.find(item => item.state === "active");
  if (!session) throw new Error("Expected shared review timer");
  expect(session.members.map(member => member.round_id).sort()).toEqual(rounds.map(round => round.id).sort());
  await expect(group.locator("[data-review-group-elapsed]")).toBeVisible();
  await expect(group.locator("[data-review-group-elapsed]")).toHaveCount(1);
  const firstRound = rounds[0];
  if (!firstRound) throw new Error("Expected first group review");
  await page.locator(`[data-review-row="${firstRound.id}"] [data-review-open]`).click();
  const drawer = page.getByRole("dialog", { name: uk.Tasks.taskDetails });
  const reviewSection = drawer.locator('section[aria-labelledby="task-review-title"]');
  await expect(reviewSection).toContainText(uk.ReviewTimer.active);
  await expect(page).toHaveURL(/\/my-tasks\?view=review$/);
  await expect(reviewSection.locator("[data-review-elapsed]")).toBeVisible();
  await reviewSection.getByRole("button", { name: uk.ReviewTimer.pause, exact: true }).click();
  await expect(reviewSection).toContainText(uk.ReviewTimer.paused);
  await page.goto("/my-tasks?view=review");
  const resumedGroup = page.getByRole("list", { name: uk.Tasks.reviewQueue }).locator("[data-review-group]");
  await expect(resumedGroup).toContainText(uk.ReviewTimer.paused);
  await resumedGroup.getByRole("button", { name: uk.ReviewTimer.resumeGroup, exact: true }).click();
  await expect(resumedGroup.locator("[data-review-group-elapsed]")).toBeVisible();
  snapshot = await timerSnapshot(page);
  const resumedSession = snapshot.sessions.find(item => item.state === "active");
  if (!resumedSession) throw new Error("Expected resumed shared review timer");
  expect(resumedSession.id).not.toBe(session.id);
  await resumedGroup.locator("[data-review-group-toggle]").click();
  await backdateActiveSession(resumedSession.id, 5);
  await page.locator(`[data-review-row="${firstRound.id}"]`).getByRole("button", { name: uk.Tasks.reviewApprove, exact: true }).click();
  await expect(page.locator(`[data-review-row="${firstRound.id}"]`)).toHaveCount(0);
  snapshot = await timerSnapshot(page);
  const accounted = snapshot.sessions.find(item => item.id === resumedSession.id);
  expect(accounted?.state).toBe("paused");
  expect(accounted?.elapsed_us).toBeGreaterThanOrEqual(5 * 60_000_000);
  expect(accounted?.members.find(member => member.round_id === firstRound.id)?.finished_at).not.toBeNull();
  const entries = await fixture.service.from("work_log_entries").select("minutes,review_round_id").eq("user_id", fixture.reviewer.id).eq("activity_kind", "review").throwOnError();
  expect(entries.data.reduce((sum, entry) => sum + entry.minutes, 0)).toBe(5);
  expect(entries.data.every(entry => entry.minutes === 0 || entry.minutes === 1)).toBe(true);
  const daily = await fixture.service.from("review_timer_daily").select("round_id,minutes").eq("user_id", fixture.reviewer.id).throwOnError();
  expect(daily.data).toHaveLength(10);
  expect(daily.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(5);
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await queue.evaluate(element => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
});

test("a second tab cannot overlap an active timer; queue rework requires a comment and creates the next round", async ({ page, browser }) => {
  const [first, second] = await createReviewRounds(2);
  if (!first || !second) throw new Error("Expected two review rounds");
  const queue = await openQueue(page);
  await queue.locator("[data-review-group-toggle]").click();
  await page.locator(`[data-review-row="${first.id}"]`).getByRole("button", { name: uk.ReviewTimer.start, exact: true }).click();
  await expect(page.locator(`[data-review-row="${first.id}"]`)).toContainText(uk.ReviewTimer.active);
  const active = (await timerSnapshot(page)).sessions.find(session => session.state === "active");
  if (!active) throw new Error("Expected active timer");
  const secondContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const otherTab = await secondContext.newPage();
    await openQueue(otherTab);
    const response = await otherTab.request.post("/api/review-timers", { data: { action: "start", sessionId: randomUUID(), roundIds: [second.id] } });
    expect(response.status()).toBe(409);
    await otherTab.reload();
    await expect(otherTab.locator("[data-active-review-timer]")).toBeVisible();
    const ownSnapshot = await timerSnapshot(otherTab);
    expect(ownSnapshot.sessions.filter(session => session.state === "active")).toHaveLength(1);
    expect(ownSnapshot.sessions.find(session => session.state === "active")?.id).toBe(active.id);
  } finally { await secondContext.close(); }

  const row = queue.locator(`[data-review-row="${first.id}"]`);
  await row.getByRole("button", { name: uk.ReviewTimer.pause, exact: true }).click();
  await row.getByRole("button", { name: uk.Tasks.reviewSendBack, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: uk.Tasks.reviewSendBack });
  const confirm = dialog.getByRole("button", { name: uk.Tasks.reviewConfirmRework, exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox", { name: uk.Tasks.reviewFixComment }).fill("Потрібно уточнити креслення");
  await confirm.click();
  await expect(page.locator(`[data-review-row="${first.id}"]`)).toHaveCount(0);
  expect(reviewSql(`select status from public.tasks where id=${sqlId(first.task_id)}`)).toBe("in_progress");
  await fixture.assignee.client.rpc("update_task_review", { p_task_id: first.task_id, p_action: "submit" }).throwOnError();
  const next = await fixture.service.from("task_review_rounds").select("round_number,result").eq("task_id", first.task_id).order("round_number").throwOnError();
  expect(next.data).toEqual([{ round_number: 1, result: "rework" }, { round_number: 2, result: null }]);
});
