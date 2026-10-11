import { test as base, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../helpers/task-review-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import en from "../../messages/en.json";

// Web Push registration is unavailable in Chromium incognito contexts. Use a
// disposable regular profile; never substitute a mocked Push subscription.
const test = base.extend({
  context: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), "studioflow-push-"));
    const context = await chromium.launchPersistentContext(profile, {
      headless: process.env.PUSH_TEST_HEADED !== "1",
      ...(process.env.PUSH_TEST_CHANNEL ? { channel: process.env.PUSH_TEST_CHANNEL } : {}),
      ignoreDefaultArgs: ["--disable-background-networking"],
      baseURL: "http://localhost:3000",
      viewport: { width: 1440, height: 1000 },
    });
    try { await use(context); } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
  },
});

let fixture: TaskReviewFixture;
test.beforeAll(async () => { fixture = await createTaskReviewFixture(); });
test.afterAll(async () => { if (fixture) await fixture.dispose(); });

test("regular website: manifest, denied permission and installation entry", async ({ page, context }) => {
  await context.addCookies([{ name: "studioflow-locale", value: "en", url: "http://localhost:3000" }]);
  await signInLocalTestUser(page, fixture.reviewer);
  await page.goto(`/team/${fixture.reviewer.id}`);
  await page.getByRole("button", { name: en.Account.profileSettings, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(en.Account.systemNotifications, { exact: true })).toBeVisible();
  const blocked = await page.evaluate(() => Notification.permission === "denied");
  if (blocked) {
    await expect(dialog.getByText(en.Account.pushState_blocked, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: en.Account.pushEnable, exact: true })).toBeDisabled();
  } else {
    await expect(dialog.getByText(en.Account.pushState_disabled, { exact: true })).toBeVisible();
  }
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "StudioFlow", display: "standalone", scope: "/", start_url: "/dashboard" });
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  expect(await page.evaluate(async () => await caches.keys())).toEqual([]);
  const install = dialog.getByRole("button", { name: en.Account.installStudioFlow, exact: true });
  await expect(install).toBeVisible();
  // Native installation acceptance and OS notification clicks require a desktop.
  await page.screenshot({ path: "test-results/pwa-profile-settings.png" });
});

test("actual Web Push from an existing task-review notification in a regular tab", async ({ page, context }) => {
  test.skip(process.env.PUSH_TEST_REAL !== "1", "Set PUSH_TEST_REAL=1 to attempt real provider delivery; no mocked Push acceptance.");
  await context.addCookies([{ name: "studioflow-locale", value: "en", url: "http://localhost:3000" }]);
  await context.grantPermissions(["notifications"]);
  await signInLocalTestUser(page, fixture.reviewer);
  await page.goto(`/team/${fixture.reviewer.id}`);
  await page.getByRole("button", { name: en.Account.profileSettings, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: en.Account.pushEnable, exact: true })).toBeEnabled();
  expect(await page.evaluate(() => matchMedia("(display-mode: standalone)").matches)).toBe(false);
  await dialog.getByRole("button", { name: en.Account.pushEnable, exact: true }).click();
  await expect(dialog.getByText(en.Account.pushState_enabled, { exact: true }), "Real browser subscription must succeed").toBeVisible({ timeout: 20_000 });
  const background = await context.newPage();
  await background.goto("about:blank");
  await background.bringToFront();
  await fixture.admin.client.rpc("update_task_review", { p_task_id: fixture.taskId, p_action: "configure", p_reviewer_ids: [fixture.reviewer.id] }).throwOnError();
  await fixture.assignee.client.rpc("update_task_review", { p_task_id: fixture.taskId, p_action: "submit" }).throwOnError();
  const notifications = await fixture.reviewer.client.from("notifications").select("id,href,read_at").eq("entity_id",fixture.taskId).eq("notification_type","task_review_requested").throwOnError();
  const notification = notifications.data?.[0];
  if (!notification) throw new Error("The actual review request did not create a notification.");
  // No HTTP dispatch call: the committed notification wakes pg_net automatically.
  await expect.poll(() => reviewSql(`select count(*) from public.web_push_deliveries where notification_id=${sqlId(notification.id)} and completed_at is not null and last_status between 200 and 299`), { timeout: 30_000 }).toBe("1");
  await expect.poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(item => item.tag)), { timeout: 20_000 }).toContain(`studioflow-${notification.id}`);
  expect(notification.href).toBe(`/projects/${fixture.projectId}?task=${fixture.taskId}`);
  expect(notification.read_at).toBeNull();
  await background.close();
  await page.bringToFront();
  await dialog.getByRole("button", { name: en.Account.pushDisable, exact: true }).click();
  await expect(dialog.getByText(en.Account.pushState_disabled, { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).pushManager.getSubscription())).toBeNull();
});
