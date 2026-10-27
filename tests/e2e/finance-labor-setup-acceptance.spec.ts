import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAutomaticLaborFixture, automaticLaborSql } from "../helpers/automatic-labor-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import { getKyivDateOnly } from "../../src/lib/validation/project";
import en from "../../messages/en.json";

test("labor setup previews current settings without activation and Overview preserves unknown costs", async ({ page }) => {
  test.setTimeout(180_000);
  const today = getKyivDateOnly(), month = `${today.slice(0, 7)}-01`;
  const fixture = await createAutomaticLaborFixture({ periodStart: month, setupPending: true });
  const { studioId, projectId, taskId, admin, employee } = fixture;
  const order = randomUUID(), request = randomUUID();
  try {
    automaticLaborSql(`insert into public.finance_project_orders(id,studio_id,project_id,name,is_default,status,created_by,updated_by,confirmed_at)
      values('${order}','${studioId}','${projectId}','Accepted services',true,'confirmed','${admin.id}','${admin.id}',now());
      select set_config('request.jwt.claim.sub','${admin.id}',false);
      select public.save_finance_project_terms('${studioId}','${request}','${projectId}',jsonb_build_object('orderId','${order}',
        'stream','design','mode','design','revision',0,'amount','10000','currency','UAH','reason','Acceptance test'));
      insert into public.work_log_days(studio_id,user_id,work_date) values('${studioId}','${employee.id}',date '${month}');
      insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,minutes)
        values('${studioId}','${employee.id}',date '${month}','task','${taskId}',120);`);
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:3100";
    await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: baseURL }]);
    await signInLocalTestUser(page, admin);
    // Only this disposable administrator's preference is changed.
    const response = await page.request.patch("/api/finance/display-currency", { data: { currency: "UAH" } });
    expect(response.ok()).toBe(true);
    await page.goto("/finance");
    const point = page.locator(`[data-economics-point="${projectId}"]`);
    await expect(point).toHaveAttribute("aria-label", /Known costs: —/);
    await expect(point.locator('[data-cost-kind="knownCosts"]')).toContainText("—");
    await page.screenshot({ path: "/tmp/studioflow-economics-unknown.png", fullPage: false });
    await page.goto("/finance/reports");
    const setup = page.getByRole("button", { name: en.Finance.labor.auto.activateTitle, exact: true });
    await page.waitForLoadState("networkidle");
    await expect(setup).toHaveAttribute("aria-expanded", "true");
    const form = page.locator('form').filter({ has: page.locator('input[name="intent"][value="configure"]') }).first();
    await expect(form.getByRole("spinbutton")).toHaveCount(0);
    await expect(form).toContainText(en.Finance.labor.auto.currentCapacityDefaults.split("{hours}")[0]);
    await expect(form.locator('input[name="internalDesignationConfirmed"], input[name="historicalCapacityConfirmed"], input[name="payrollSourcesConfirmed"]')).toHaveCount(0);
    await expect(form.getByLabel(en.Finance.labor.auto.capacityDateLabel, { exact: true })).toBeVisible();
    await expect(form.getByRole("button", { name: en.Finance.labor.auto.activate, exact: true })).toBeDisabled();
    await form.getByRole("button", { name: en.Finance.labor.auto.previewImpact, exact: true }).click();
    await expect(form.getByText(en.Finance.labor.auto.costPreviewHelp, { exact: true })).toBeVisible();
    await expect(form).toContainText("Automatic labor client:");
    await expect(form.getByRole("button", { name: en.Finance.labor.auto.activate, exact: true })).toBeEnabled();
    expect(automaticLaborSql(`select count(*) from public.finance_labor_automation where studio_id='${studioId}'`)).toBe("0");
    expect(automaticLaborSql(`select count(*) from public.finance_labor_capacity_revisions where studio_id='${studioId}'`)).toBe("0");
    expect(automaticLaborSql(`select count(*) from public.finance_recognition_entries where studio_id='${studioId}'`)).toBe("0");
    await form.screenshot({ path: "/tmp/studioflow-labor-setup-preview.png" });
  } finally {
    automaticLaborSql(`begin; set local session_replication_role=replica;
      delete from public.finance_project_terms where studio_id='${studioId}';
      delete from public.finance_project_orders where studio_id='${studioId}'; commit;`);
    await fixture.dispose();
  }
});
