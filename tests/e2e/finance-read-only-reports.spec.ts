import { expect, test } from "@playwright/test";
import { createFinanceReadFixture, financeSnapshot, recognitionSnapshot } from "../helpers/finance-readonly-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import uk from "../../messages/uk.json";

test("loading and reloading eligible Finance sources and labor previews never changes financial records", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await createFinanceReadFixture();
  try {
    await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: String(test.info().project.use.baseURL) }]);
    await signInLocalTestUser(page, fixture.admin);
    const before = financeSnapshot(fixture.studioId);
    await page.goto("/finance/reports");
    await expect(page.getByRole("button", { name: uk.Finance.labor.auto.activateTitle, exact: true })).toBeVisible();
    await page.reload();
    const form = page.locator("form").filter({ has: page.locator('input[name="intent"][value="configure"]') }).first();
    await form.getByRole("button", { name: uk.Finance.labor.auto.previewImpact, exact: true }).click();
    await expect(form.getByText(uk.Finance.labor.auto.previewTitle, { exact: true })).toBeVisible();
    for (const path of ["/finance", "/finance/planning", "/finance/schedules", "/finance/reports"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(financeSnapshot(fixture.studioId), path).toBe(before);
    }
    // Exercise a second read-only preview after all loaders have finished.
    await form.getByRole("button", { name: uk.Finance.labor.auto.previewImpact, exact: true }).click();
    await expect(form.getByText(uk.Finance.labor.auto.previewTitle, { exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(financeSnapshot(fixture.studioId)).toBe(before);
    expect(recognitionSnapshot(fixture.studioId)).toBe("[]");
  } finally { await fixture.dispose(); }
});
