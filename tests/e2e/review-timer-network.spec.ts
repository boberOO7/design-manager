import { expect, test } from "@playwright/test";
import { createTaskReviewFixture, type TaskReviewFixture } from "../helpers/task-review-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import uk from "../../messages/uk.json";
import { currentReviewTimerSession, reviewTimerSnapshotSchema } from "../../src/lib/review-timer";

let fixture: TaskReviewFixture;
test.beforeEach(async () => { fixture = await createTaskReviewFixture(); });
test.afterEach(async () => { if (fixture) await fixture.dispose(); });

test("global timer and reminders share refreshes across startup, controls, navigation and refocus", async ({ page }) => {
  test.setTimeout(180_000);
  const { admin, assignee, reviewer, taskId } = fixture;
  await admin.client.rpc("update_task_review", { p_task_id: taskId, p_action: "configure", p_reviewer_ids: [reviewer.id] }).throwOnError();
  await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://localhost:3000" }]);
  await signInLocalTestUser(page, reviewer);
  const requests: { timer: number; reminders: number } = { timer: 0, reminders: 0 };
  page.on("request", request => {
    if (request.method() !== "GET") return;
    const url = new URL(request.url());
    if (url.pathname === "/api/review-timers") requests.timer++;
    if (url.pathname === "/api/work-log" && url.searchParams.get("mode") === "reminders") requests.reminders++;
  });
  const counts: Record<string, typeof requests> = {};
  async function observe(name: string, action: () => Promise<unknown>, milliseconds: number) {
    const before = { ...requests };
    await action();
    await page.waitForTimeout(milliseconds);
    counts[name] = { timer: requests.timer - before.timer, reminders: requests.reminders - before.reminders };
  }
  await observe("initial (16s)", () => page.goto("/my-tasks?view=review"), 16_000);
  const island = page.locator("[data-review-island]");
  const time = island.locator("[data-active-review-elapsed]");
  await observe("active (16s)", () => page.getByRole("list", { name: uk.Tasks.reviewQueue })
    .getByRole("button", { name: uk.ReviewTimer.start, exact: true }).click(), 16_000);
  await expect(island).toHaveAttribute("data-state", "active");
  const running = await time.textContent();
  await expect.poll(() => time.textContent()).not.toBe(running);
  await observe("paused (16s)", () => island.getByRole("button", { name: uk.ReviewTimer.pause, exact: true }).click(), 16_000);
  await expect(island).toHaveAttribute("data-state", "paused");
  const frozen = await time.textContent();
  await observe("navigation (2s)", () => page.locator('aside a[href="/dashboard"]').last().click(), 2000);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(time).toHaveText(frozen ?? "");
  await observe("refocus (2s)", () => page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  }), 2000);
  await expect(time).toHaveText(frozen ?? "");
  await observe("resume (2s)", () => island.getByRole("button", { name: uk.ReviewTimer.resume, exact: true }).click(), 2000);
  await expect(island).toHaveAttribute("data-state", "active");
  console.log("NETWORK_COUNTS", JSON.stringify(counts));
  await test.info().attach("network-counts", { body: JSON.stringify(counts, null, 2), contentType: "application/json" });
  if (process.env.REVIEW_TIMER_NETWORK_BASELINE) return;
  expect(counts["initial (16s)"].timer).toBe(0);
  // The auth helper's landing page can still mount while the queue navigation begins.
  expect(counts["initial (16s)"].reminders).toBeLessThanOrEqual(2);
  expect(counts["active (16s)"].timer).toBe(1);
  expect(counts["paused (16s)"].timer).toBe(0);
  expect(counts["refocus (2s)"]).toEqual({ timer: 1, reminders: 1 });
  expect(counts["resume (2s)"].timer).toBeLessThanOrEqual(1);
  expect(counts["navigation (2s)"].reminders).toBe(0);

  await page.getByRole("button", { name: uk.WorkLog.entry, exact: true }).click();
  const log = page.getByRole("dialog", { name: uk.WorkLog.title });
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === "/api/work-log" && response.request().method() === "PUT");
  await observe("work log save (2s)", () => log.getByRole("button", { name: uk.WorkLog.save, exact: true }).click(), 2000);
  expect((await saved).ok()).toBe(true);
  expect(counts["work log save (2s)"].reminders).toBe(1);
  await log.getByRole("button", { name: uk.WorkLog.close, exact: true }).click();

  const other = await page.context().newPage();
  try {
    await other.goto("/dashboard");
    const otherIsland = other.locator("[data-review-island]");
    await expect(otherIsland).toHaveAttribute("data-state", "active");
    await island.locator("[data-review-island-toggle]").click();
    await island.getByRole("button", { name: uk.ReviewTimer.pause, exact: true }).click();
    await expect(otherIsland).toHaveAttribute("data-state", "paused");
    await otherIsland.getByRole("button", { name: uk.ReviewTimer.resume, exact: true }).click();
    await expect(island).toHaveAttribute("data-state", "active");
    await expect(island.locator("[data-review-island-toggle]")).toHaveAttribute("aria-expanded", "true");
    // A server-side change without a BroadcastChannel notification simulates another device.
    const snapshot = await page.request.get("/api/review-timers");
    const current = currentReviewTimerSession(reviewTimerSnapshotSchema.parse(await snapshot.json()));
    if (!current) throw new Error("Expected an active review session");
    const paused = await page.request.post("/api/review-timers", { data: { action: "pause", sessionId: current.id } });
    expect(paused.ok()).toBe(true);
    await expect(island).toHaveAttribute("data-state", "paused", { timeout: 20_000 });
    await expect(otherIsland).toHaveAttribute("data-state", "paused", { timeout: 20_000 });
    console.log("NETWORK_BEHAVIOR_OK", JSON.stringify({ workLogSave: counts["work log save (2s)"], crossTab: true, devicePolling: true, expandedIsland: true }));
  } finally { await other.close(); }
});
