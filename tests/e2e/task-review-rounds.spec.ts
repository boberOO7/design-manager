import { expect, test, type Page } from "@playwright/test";
import { createTaskReviewFixture, type TaskReviewFixture } from "../helpers/task-review-fixture";
import uk from "../../messages/uk.json";

let fixture: TaskReviewFixture;
test.beforeAll(async () => { fixture = await createTaskReviewFixture(); });
test.afterAll(async () => { if (fixture) await fixture.dispose(); });

async function login(page: Page, account: TaskReviewFixture["admin"]) {
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://127.0.0.1:3100" }]);
  await page.goto("/login");
  // The existing development server may still be loading its client bundle
  // when the server-rendered form becomes visible.
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return form && Object.keys(form).some((key) => key.startsWith("__reactProps") && typeof Object.getOwnPropertyDescriptor(form, key)?.value?.onSubmit === "function");
  });
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("task → submit → review queue → rework → Review #2 → approve", async ({ page, browser }) => {
  const { projectId, taskId, admin, assignee, reviewer } = fixture;
  await login(page, admin);
  await page.goto(`/projects/${projectId}?task=${taskId}`);
  const adminDrawer = page.getByRole("dialog", { name: uk.Tasks.taskDetails });
  await adminDrawer.getByRole("button", { name: uk.Tasks.editTask, exact: true }).click();
  const settings = adminDrawer.locator('section[aria-labelledby="task-review-title"]');
  await settings.getByRole("combobox", { name: uk.Tasks.reviewAddReviewer }).click();
  await adminDrawer.getByRole("option", { name: "Review Reviewer", exact: true }).click();
  await settings.getByRole("combobox", { name: uk.Tasks.reviewAddReviewer }).click();
  await adminDrawer.getByRole("option", { name: "Review Admin", exact: true }).click();
  await expect(settings.getByRole("checkbox")).toHaveCount(0);
  await expect(settings.getByRole("button", { name: /Зберегти/ })).toHaveCount(0);
  // Review settings participate in the main edit transaction and cancel.
  await adminDrawer.getByRole("button", { name: uk.Tasks.cancel, exact: true }).click();
  expect((await admin.client.from("tasks").select("requires_review").eq("id", taskId).single().throwOnError()).data.requires_review).toBe(false);
  await adminDrawer.getByRole("button", { name: uk.Tasks.editTask, exact: true }).click();
  await settings.getByRole("combobox", { name: uk.Tasks.reviewAddReviewer }).click();
  await adminDrawer.getByRole("option", { name: "Review Reviewer", exact: true }).click();
  await settings.getByRole("combobox", { name: uk.Tasks.reviewAddReviewer }).click();
  await adminDrawer.getByRole("option", { name: "Review Admin", exact: true }).click();
  await adminDrawer.getByRole("button", { name: uk.Tasks.saveChanges, exact: true }).click();
  await expect(adminDrawer.getByRole("button", { name: uk.Tasks.editTask, exact: true })).toBeVisible();

  const assigneeContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const reviewerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const workerPage = await assigneeContext.newPage();
    const reviewerPage = await reviewerContext.newPage();
    await login(workerPage, assignee);
    await workerPage.goto(`/projects/${projectId}?task=${taskId}`);
    const workerDrawer = workerPage.getByRole("dialog", { name: uk.Tasks.taskDetails });
    await workerDrawer.getByRole("button", { name: uk.Tasks.reviewSubmit }).click();
    await expect(workerDrawer.getByRole("heading", { name: "Review #1", exact: true })).toBeVisible();
    await expect(workerDrawer.getByRole("button", { name: uk.Tasks.reviewApprove })).toHaveCount(0);
    await expect(workerPage.locator("[data-task-card]").filter({ hasText: "Review lifecycle task" }).first()).toContainText("Review #1");

    await login(reviewerPage, reviewer);
    await reviewerPage.goto("/my-tasks");
    await reviewerPage.getByRole("link", { name: uk.Tasks.reviewQueue, exact: true }).click();
    const queue = reviewerPage.getByRole("list", { name: uk.Tasks.reviewQueue });
    await expect(queue).toContainText("Review #1");
    await expect(queue).toContainText("Review Assignee");
    await expect(queue).not.toContainText("Review Reviewer");
    await expect(queue).toContainText(uk.Priority.high);
    await expect(queue.getByRole("button", { name: uk.ReviewTimer.start })).toBeVisible();
    await queue.getByRole("link").click();
    const reviewerDrawer = reviewerPage.getByRole("dialog", { name: uk.Tasks.taskDetails });
    await reviewerDrawer.getByRole("button", { name: uk.ReviewTimer.start }).click();
    await reviewerDrawer.getByRole("button", { name: uk.Tasks.reviewSendBack }).click();
    await expect(reviewerDrawer.getByRole("button", { name: uk.Tasks.reviewConfirmRework, exact: true })).toBeDisabled();
    await reviewerDrawer.getByRole("textbox", { name: uk.Tasks.reviewFixComment }).fill("Виправити креслення");
    await reviewerDrawer.getByRole("button", { name: uk.Tasks.reviewConfirmRework, exact: true }).click();
    await expect(reviewerDrawer.getByText("Виправити креслення", { exact: true })).toBeVisible();
    await expect(reviewerPage.locator("[data-task-card]").filter({ hasText: "Review lifecycle task" }).first()).toContainText(uk.Tasks.reviewReworkBadge);
    await reviewerPage.goto("/my-tasks?view=review");
    await expect(reviewerPage.getByText(uk.Tasks.reviewQueueEmpty)).toBeVisible();

    await workerPage.reload();
    await expect(workerDrawer.getByText("Виправити креслення", { exact: true })).toBeVisible();
    await workerDrawer.getByRole("button", { name: uk.Tasks.reviewSubmit }).click();
    await expect(workerDrawer.getByRole("heading", { name: "Review #2", exact: true })).toBeVisible();
    await reviewerPage.reload();
    await expect(reviewerPage.getByRole("list", { name: uk.Tasks.reviewQueue })).toContainText("Review #2");
    await reviewerPage.getByRole("list", { name: uk.Tasks.reviewQueue }).getByRole("link").click();
    await reviewerDrawer.getByRole("button", { name: uk.ReviewTimer.start }).click();
    await reviewerDrawer.getByRole("button", { name: uk.Tasks.reviewApprove }).click();
    // The designer approves only their step; management completes this round.
    await expect(reviewerDrawer.getByRole("heading", { name: "Review #2", exact: true })).toBeVisible();
    await expect(reviewerDrawer.locator("header")).toContainText(uk.Status.internal_review);
    await expect(reviewerDrawer.getByRole("button", { name: uk.Tasks.reviewApprove })).toHaveCount(0);
    await page.goto("/my-tasks?view=review");
    const managementQueue = page.getByRole("list", { name: uk.Tasks.reviewQueue });
    await expect(managementQueue).toContainText("Review Admin");
    await managementQueue.getByRole("link").click();
    await adminDrawer.getByRole("button", { name: uk.ReviewTimer.start }).click();
    await adminDrawer.getByRole("button", { name: uk.Tasks.reviewApprove }).click();
    await expect(adminDrawer.locator("header")).toContainText(uk.Status.review);
    await reviewerPage.reload();
    await expect(reviewerDrawer.locator("header")).toContainText(uk.Status.review);
    await expect(reviewerDrawer.locator("header")).not.toContainText(uk.Status.completed);
    await reviewerDrawer.getByRole("button", { name: "2 перевірок · Переглянути історію" }).click();
    const history = reviewerDrawer.locator("#task-review-history");
    await expect(history).toContainText("Review #1");
    await expect(history).toContainText("Виправити креслення");
    await expect(history).toContainText("Review #2");
    await expect(history).toContainText(uk.Tasks.reviewApproved);
    const persisted = await assignee.client.from("task_review_rounds").select("round_number, result, rework_comment").eq("task_id", taskId).order("round_number").throwOnError();
    expect(persisted.data).toEqual([{ round_number: 1, result: "rework", rework_comment: "Виправити креслення" }, { round_number: 2, result: "approved", rework_comment: null }]);
  } finally { await assigneeContext.close(); await reviewerContext.close(); }
});
