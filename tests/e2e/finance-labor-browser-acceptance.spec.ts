import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAutomaticLaborFixture, automaticLaborSql } from "../helpers/automatic-labor-fixture";
import { signInLocalTestUser } from "../helpers/auth";
import { getKyivDateOnly } from "../../src/lib/validation/project";
import uk from "../../messages/uk.json";

const copy = uk.Finance.labor.auto;
const today = getKyivDateOnly(), month = `${today.slice(0, 7)}-01`;
const setupForm = (page: Page) => page.locator("form").filter({ has: page.locator('input[name="intent"][value="configure"]') }).first();

async function openSetup(page: Page, admin: { email: string; password: string }) {
  // Preview uses a button action; submitting any settings form is forbidden here.
  await page.addInitScript(() => document.addEventListener("submit", event => event.preventDefault(), true));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: String(test.info().project.use.baseURL) }]);
  await signInLocalTestUser(page, admin);
  await page.goto("/finance/reports");
  await expect(page.getByRole("button", { name: copy.activateTitle, exact: true })).toHaveAttribute("aria-expanded", "true");
}

function assertNoActivationOrPosting(studioId: string) {
  expect(automaticLaborSql(`select count(*) from public.finance_labor_automation where studio_id='${studioId}'`)).toBe("0");
  expect(automaticLaborSql(`select count(*) from public.finance_recognition_entries where studio_id='${studioId}'`)).toBe("0");
}

test("incomplete labor setup asks for missing historical coverage and previews missing Worklog without saving", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await createAutomaticLaborFixture({ periodStart: month, setupPending: true });
  try {
    await openSetup(page, fixture.admin);
    const form = setupForm(page);
    await expect(form.getByLabel(copy.capacityDateLabel, { exact: true })).toBeVisible();
    await expect(form.getByRole("spinbutton")).toHaveCount(0);
    await expect(form.locator('input[name="internalDesignationConfirmed"], input[name="historicalCapacityConfirmed"], input[name="payrollSourcesConfirmed"]')).toHaveCount(0);
    await expect(form.locator('button[type="submit"]')).toBeDisabled();
    await form.screenshot({ animations: "disabled", path: "/tmp/labor-acceptance-incomplete-before.png" });
    await form.getByRole("button", { name: copy.previewImpact, exact: true }).click();
    await expect(form.getByText(copy.previewTitle, { exact: true })).toBeVisible();
    await expect(form).toContainText(uk.Finance.historicalLabor.issue.missing_reports);
    await expect(form).toContainText(copy.provisionalRemainder);
    await form.screenshot({ animations: "disabled", path: "/tmp/labor-acceptance-incomplete-preview.png" });
    assertNoActivationOrPosting(fixture.studioId);
    expect(automaticLaborSql(`select count(*) from public.finance_labor_capacity_revisions where studio_id='${fixture.studioId}'`)).toBe("0");
  } finally { await fixture.dispose(); }
});

test("existing employee schedules do not require another historical studio schedule", async ({ page }) => {
  const fixture = await createAutomaticLaborFixture({ periodStart: month, setupPending: true });
  try {
    automaticLaborSql(`insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
      values('${fixture.studioId}','${fixture.employee.id}',date '${month}',360,array[1,2,3,4,5],'${fixture.admin.id}');`);
    await openSetup(page, fixture.admin);
    const form = setupForm(page);
    await form.screenshot({ animations: "disabled", path: "/tmp/labor-acceptance-employee-schedule.png" });
    await expect(form.getByLabel(copy.capacityDateLabel, { exact: true })).toHaveCount(0);
    await form.getByRole("button", { name: copy.previewImpact, exact: true }).click();
    await expect(form.getByText(copy.previewTitle, { exact: true })).toBeVisible();
    await expect(form).not.toContainText(uk.Finance.historicalLabor.issue.missing_capacity);
    assertNoActivationOrPosting(fixture.studioId);
  } finally { await fixture.dispose(); }
});

test("ready setup reuses evidence, keeps internal work at studio level and reviews only unresolved payroll sources", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await createAutomaticLaborFixture({ periodStart: month, setupPending: true });
  const { studioId, employee, admin, taskId, projectId } = fixture;
  try {
    automaticLaborSql(`insert into public.finance_labor_capacity_revisions(studio_id,effective_from,daily_minutes,weekdays,created_by)
      values('${studioId}',date '${month}',360,array[1,2,3,4,5],'${admin.id}');
      insert into public.work_log_days(studio_id,user_id,work_date)
      select '${studioId}','${employee.id}',d::date from generate_series(date '${month}',date '${today}',interval '1 day') d where extract(isodow from d)<6;
      insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,task_id,minutes)
      select '${studioId}','${employee.id}',work_date,'task','${taskId}',120 from public.work_log_days where studio_id='${studioId}';
      insert into public.work_log_entries(studio_id,user_id,work_date,activity_kind,internal_activity_type,minutes)
      select '${studioId}','${employee.id}',work_date,'internal','team_walkthrough',240 from public.work_log_days where studio_id='${studioId}';`);
    await openSetup(page, admin);
    const form = setupForm(page);
    await expect(form.getByLabel(copy.capacityDateLabel, { exact: true })).toHaveCount(0);
    await expect(form.getByRole("spinbutton")).toHaveCount(0);
    await expect(form.getByRole("combobox")).toHaveCount(1);
    await form.screenshot({ animations: "disabled", path: "/tmp/labor-acceptance-ready-before.png" });
    await form.getByRole("button", { name: copy.previewImpact, exact: true }).click();
    await expect(form.getByText(copy.previewTitle, { exact: true })).toBeVisible();
    await expect(form).toContainText("Automatic labor client:");
    await expect(form).not.toContainText(uk.Finance.historicalLabor.issue.missing_reports);
    await expect(form).toContainText("6 годин");
    const summary = await form.getByText(new RegExp(`^${copy.calculatedCost}:`)).innerText();
    const amounts = [...summary.matchAll(/([0-9]+\.[0-9]+) UAH/g)].map(match => Number(match[1]));
    const projectText = await form.getByText(/^Automatic labor client:/).innerText();
    const projectAmount = Number(projectText.match(/([0-9]+\.[0-9]+) UAH/)?.[1]);
    expect(amounts).toHaveLength(2);
    expect(Math.abs(amounts[0] - projectAmount - amounts[1])).toBeLessThan(0.02);
    expect(Math.abs(projectAmount - amounts[0] / 3)).toBeLessThan(0.02);
    await form.getByRole("button", { name: copy.activate, exact: true }).click({ trial: true });
    await form.screenshot({ animations: "disabled", path: "/tmp/labor-acceptance-ready-preview.png" });
    // Choosing an exclusion can only remove that project's cost, never add internal minutes to it.
    await form.getByRole("button", { name: copy.internalProjectOptional, exact: true }).click();
    await form.getByRole("combobox", { name: copy.internalProjectLabel, exact: true }).selectOption(projectId);
    await expect(form.getByText(copy.previewTitle, { exact: true })).toHaveCount(0);
    await form.getByRole("button", { name: copy.previewImpact, exact: true }).click();
    await expect(form.getByText(copy.previewTitle, { exact: true })).toBeVisible();
    await expect(form).not.toContainText("Automatic labor client:");
    await form.getByRole("combobox", { name: copy.internalProjectLabel, exact: true }).selectOption("");

    const knownSchedule = randomUUID(), unknownSchedule = randomUUID(), serviceSchedule = randomUUID();
    const knownTerm = randomUUID(), unknownTerm = randomUUID(), serviceTerm = randomUUID();
    automaticLaborSql(`insert into public.finance_schedules(id,studio_id,kind,created_by) values
      ('${knownSchedule}','${studioId}','recurring','${admin.id}'),('${unknownSchedule}','${studioId}','recurring','${admin.id}'),('${serviceSchedule}','${studioId}','recurring','${admin.id}');
      insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
      select id,'${studioId}',schedule,1,name,100,'UAH',(select id from public.finance_categories where studio_id='${studioId}' and default_key=category),1,31,0,case when id='${serviceTerm}'::uuid then (date '${month}'+interval '1 month')::date else date '${month}' end,'agreed','fixed','Browser acceptance','${admin.id}'
      from (values ('${knownTerm}'::uuid,'${knownSchedule}'::uuid,'Previously reviewed payment','employer_costs'),('${unknownTerm}'::uuid,'${unknownSchedule}'::uuid,'Unresolved payroll payment','employer_costs'),('${serviceTerm}'::uuid,'${serviceSchedule}'::uuid,'Unrelated office service','rent')) t(id,schedule,name,category);
      insert into public.finance_planning_requests(studio_id,request_id,result_id,created_by,payload)
      values('${studioId}','${randomUUID()}','${knownTerm}','${admin.id}',jsonb_build_object('operation','labor_capacity','input',jsonb_build_object('payrollSourcesConfirmed',true,'payrollCashTermIds',jsonb_build_array('${knownTerm}'))));`);
    await page.reload();
    await expect(form).toContainText("Unresolved payroll payment");
    await expect(form).not.toContainText("Previously reviewed payment");
    await expect(form).not.toContainText("Unrelated office service");
    const review = form.getByRole("group", { name: copy.sourceReviewTitle, exact: true });
    await expect(review.getByRole("combobox")).toHaveCount(1);
    await expect(form.getByRole("button", { name: copy.previewImpact, exact: true })).toBeDisabled();
    await review.getByRole("combobox").selectOption("cash");
    await form.getByRole("button", { name: copy.previewImpact, exact: true }).click();
    await expect(form.getByText(copy.previewTitle, { exact: true })).toBeVisible();
    await form.screenshot({ animations: "disabled", path: "/tmp/labor-acceptance-source-review.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(form).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await form.screenshot({ animations: "disabled", path: "/tmp/labor-acceptance-mobile.png" });
    assertNoActivationOrPosting(studioId);
    expect(automaticLaborSql(`select count(*) from public.finance_labor_capacity_revisions where studio_id='${studioId}'`)).toBe("1");
  } finally {
    // Recurring-source fixtures also create policies; remove only this test's rows.
    automaticLaborSql(`begin; set local session_replication_role=replica;
      delete from public.finance_expense_service_policies where studio_id='${studioId}'; commit;`);
    await fixture.dispose();
  }
});
