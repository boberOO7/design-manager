import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import { financeOverviewSchema } from "../../src/lib/finance-overview";
import type { Database } from "../../src/types/database.types";
const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Finance fixtures only");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), bank = randomUUID();
const actors = ["admin", "employee"].map(role => ({ role, id: "", email: `forecast-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` }));
const t = en.Finance.forecast;
test("shared controls, snapshot surfaces and disclosures support keyboard and motion", async ({ page }, testInfo) => {
  await login(page); await page.goto("/finance/planning");
  await expect(page.getByRole("heading", { name: t.title, exact: true })).toBeVisible();
  const horizonSelect = page.getByRole("combobox", { name: t.horizon, exact: true });
  const scenarioSelect = page.getByRole("combobox", { name: t.scenario, exact: true });
  await expect(horizonSelect).toContainText(t.horizons["6"]);
  await expect(scenarioSelect).toContainText(t.confirmed);
  await horizonSelect.click();
  await expect(page.getByRole("option", { name: t.horizons["12"], exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const trigger = page.getByRole("button", { name: t.saveSnapshot, exact: true });
  const before = await horizonSelect.boundingBox();
  await trigger.click();
  const snapshotName = page.getByLabel(t.snapshotName, { exact: true });
  await expect(snapshotName).toBeFocused();
  await expect(page.getByRole("dialog", { name: t.saveSnapshot })).toHaveCount(0);
  expect(await horizonSelect.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath("snapshot-popover.png") });
  await page.keyboard.press("Escape");
  await expect(snapshotName).toBeHidden(); await expect(trigger).toBeFocused();
  await trigger.click(); await page.getByRole("button", { name: en.Finance.planning.cancel, exact: true }).click();
  await expect(snapshotName).toBeHidden(); await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 375, height: 900 });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: t.saveSnapshot });
  await expect(dialog).toBeVisible(); await expect(page.getByLabel(t.snapshotName, { exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const label of [t.attention.replace("{count}", "1"), t.monthlyCash, t.comparison, t.datedItems.split("{count}")[0].trim(), t.fxTitle, t.forecastBasis]) {
    const button = page.getByRole("button", { name: label, exact: false });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.focus(); await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const region = page.getByRole("region", { name: label, exact: false });
    await expect(region).toBeVisible();
    expect(await region.evaluate(el => getComputedStyle(el).transitionDuration)).toBe("0.22s");
    await expect.poll(() => region.evaluate(el => Math.abs(el.getBoundingClientRect().height - (el.firstElementChild?.getBoundingClientRect().height ?? 0)))).toBeLessThan(1);
    await button.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`disclosure-${await button.getAttribute("aria-controls")}.png`) });
    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(region).toBeHidden();
  }
  await page.getByRole("link", { name: en.Finance.overview.budgetDetails, exact: true }).click();
  await expect(page.getByRole("button", { name: t.comparison, exact: false })).toHaveAttribute("aria-expanded", "true");
  await page.evaluate(() => { document.documentElement.dataset.motion = "off"; });
  expect(await page.getByRole("region", { name: t.comparison, exact: false }).evaluate(el => getComputedStyle(el).transitionDuration)).toBe("1e-05s");
  await page.goto("/finance/planning?detail=comparison#planning-comparison");
  await expect(page.getByRole("table", { name: t.comparison, exact: true })).toBeVisible();
});
function sql(statement: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim(); }
async function login(page: Page, index = 0) { await page.goto("/login"); await page.locator('input[type="email"]').fill(actors[index].email); await page.locator('input[type="password"]').fill(actors[index].password); await page.locator('button[type="submit"]').click(); await expect(page).toHaveURL(/\/dashboard/); }
let category = "";
test.beforeAll(async () => {
  await client.from("studios").insert({ id: studio, name: "Forecast browser test" }).throwOnError();
  for (const actor of actors) {
    const { data, error } = await client.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true }); if (error) throw error; actor.id = data.user.id;
    await client.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: `Forecast ${actor.role}`, system_role: actor.role, is_active: true }).throwOnError();
    await client.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: actor.role, joined_at: "2026-01-01" }).throwOnError();
  }
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH',date_trunc('month',now() at time zone 'Europe/Kyiv')::date,'${actors[0].id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','Bank','UAH',1000,'${actors[0].id}');
    select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.finalize_finance_setup('${studio}');`);
  category = sql(`select id from public.finance_categories where studio_id='${studio}' and default_key='project_payments'`);
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    do $$declare item uuid; begin
      item:=public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','100000','currency','UAH','categoryId','${category}','description','Contract receipt','dueDate',(now() at time zone 'Europe/Kyiv')::date,'expectedDate',(now() at time zone 'Europe/Kyiv')::date,'commitment','agreed','certainty','fixed'));
      perform public.record_finance_expected_payment('${studio}',gen_random_uuid(),item,jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','40000','accountId','${bank}','categoryId','${category}'),40000);
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','100','currency','UAH','categoryId','${category}','description','Tentative receipt','expectedDate',(now() at time zone 'Europe/Kyiv')::date,'commitment','tentative','certainty','estimated'));
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','75','currency','UAH','categoryId','${category}','description','Undated receipt','commitment','agreed','certainty','fixed'));
    end $$;`);
});
test.afterAll(async () => {
  sql(`begin;set local session_replication_role=replica;
    delete from public.finance_forecast_snapshots where studio_id='${studio}';delete from public.finance_budget_revisions where studio_id='${studio}';
    delete from public.finance_allocations where studio_id='${studio}';delete from public.finance_expected_items where studio_id='${studio}';
    delete from public.finance_planning_requests where studio_id='${studio}';delete from public.finance_movement_entries where studio_id='${studio}';delete from public.finance_movements where studio_id='${studio}';
    delete from public.finance_accounts where studio_id='${studio}';delete from public.finance_categories where studio_id='${studio}';delete from public.finance_settings where studio_id='${studio}';
    delete from public.notifications where studio_id='${studio}';delete from public.studio_members where studio_id='${studio}';delete from public.studios where id='${studio}';commit;`);
  for (const actor of actors) if (actor.id) { const { error } = await client.auth.admin.deleteUser(actor.id); if (error) throw error; }
});
test("Forecast primary view stays focused with complete data and no budget", async ({ page }) => {
  sql(`update public.finance_expected_items set expected_payment_date=(now() at time zone 'Europe/Kyiv')::date where studio_id='${studio}' and description='Undated receipt'`);
  await login(page); await page.goto("/finance/planning");
  await expect(page.getByText(en.Finance.overview.cash, { exact: true })).toBeVisible();
  await expect(page.getByText(t.horizonCash, { exact: true })).toBeVisible();
  await expect(page.getByText(en.Finance.overview.lowPoint, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.Finance.overview.cashChart, exact: true })).toBeVisible();
  await expect(page.getByText(en.Finance.overview.flows, { exact: true })).toHaveCount(0);
  await expect(page.getByText(t.incompletePlain, { exact: true })).toHaveCount(0);
  const comparison = page.getByRole("button", { name: new RegExp(t.comparison) });
  await expect(comparison).toHaveAttribute("aria-expanded", "false");
  await comparison.click();
  await expect(page.getByText(t.noBudgetForScope, { exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: t.comparison, exact: true })).toHaveCount(0);
});
test("Forecast primary view summarizes incomplete data and reveals individual reasons on demand", async ({ page }) => {
  sql(`update public.finance_expected_items set expected_payment_date=null,due_date=null where studio_id='${studio}' and description='Undated receipt'`);
  await login(page); await page.goto("/finance/planning");
  await expect(page.getByText(t.incompletePlain, { exact: true })).toBeVisible();
  await expect(page.getByText(t.incompletePlain, { exact: true })).toHaveCount(1);
  const attention = page.getByRole("button", { name: new RegExp(t.attentionDetails.split("{")[0].trim()) });
  await expect(attention).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Undated receipt", { exact: true })).toHaveCount(0);
  await attention.click();
  const undated = page.getByText(t.issues.undated, { exact: true });
  await expect(undated).toBeVisible();
  await undated.click();
  await expect(page.getByText("Undated receipt", { exact: true })).toBeVisible();
  const comparison = page.getByRole("button", { name: new RegExp(t.comparison) });
  await expect(comparison).toHaveAttribute("aria-expanded", "false");
  await comparison.click();
  await expect(page.getByText(t.noBudgetForScope, { exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: t.comparison, exact: true })).toHaveCount(0);
});
test("annual revisions, scenarios, horizons, attention and stable snapshot comparison", async ({ page }, testInfo) => {
  const pageErrors: string[] = []; page.on("pageerror", error => pageErrors.push(error.message));
  await login(page); await page.goto("/finance/planning");
  await expect(page.getByRole("heading", { name: t.title, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: t.modes.forecast, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: t.annualBudget, exact: true })).toBeHidden();
  await page.getByRole("button", { name: t.attention.replace("{count}", "1"), exact: false }).click();
  await expect(page.getByText(t.incomplete, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: t.comparison, exact: false }).click();
  await expect(page.getByText(t.issues.undated, { exact: false })).toBeVisible();
  const comparison = page.getByRole("table", { name: t.comparison });
  await expect(comparison.getByRole("cell", { name: "40,000.00", exact: true })).toBeVisible();
  await expect(comparison.getByRole("cell", { name: "60,000.00", exact: true })).toBeVisible();
  await page.getByRole("link", { name: t.modes.budget, exact: true }).click();
  await page.getByRole("combobox", { name: t.category, exact: true }).click();
  const categorySearch = page.getByRole("combobox", { name: en.Finance.planning.searchCategories, exact: true });
  await categorySearch.fill("Project pay");
  await expect(page.getByRole("option", { name: /Project payments/ })).toBeVisible();
  await page.getByRole("option", { name: /Project payments/ }).click();
  await page.getByLabel(t.repeatAmount, { exact: true }).fill("100000"); await page.getByRole("button", { name: t.fillYear, exact: true }).click();
  await expect(page.locator('input[name="months"]')).toHaveCount(12);
  await page.getByLabel(t.revisionNote, { exact: true }).fill("Approved reference"); await page.getByRole("button", { name: t.approveBudget, exact: true }).click();
  await expect(page.getByText(t.budgetSaved, { exact: true })).toBeVisible();
  expect(sql(`select count(*) from public.finance_movements where studio_id='${studio}'`)).toBe("1");
  expect(sql(`select count(*) from public.finance_expected_items where studio_id='${studio}'`)).toBe("3");
  await expect(page.getByText("Revision 1", { exact: false }).first()).toBeVisible();
  await page.getByLabel(t.repeatAmount, { exact: true }).fill("150000"); await page.getByRole("button", { name: t.fillYear, exact: true }).click();
  await page.getByLabel(t.revisionNote, { exact: true }).fill("Deliberate amendment"); await page.getByRole("button", { name: t.approveBudget, exact: true }).click();
  await expect(page.getByText("Revision 2", { exact: false }).first()).toBeVisible();
  expect(sql(`select count(*) from public.finance_budget_revisions where studio_id='${studio}'`)).toBe("2");
  await page.getByText(t.budgetHistory, { exact: true }).click(); await expect(page.getByText(/Approved reference/)).toBeVisible();
  await page.getByRole("link", { name: t.modes.forecast, exact: true }).click();
  await page.getByRole("combobox", { name: t.scenario, exact: true }).click(); await page.getByRole("option", { name: t.planned, exact: true }).click();
  await expect(page).toHaveURL(/scenario=planned/);
  await page.getByRole("combobox", { name: t.horizon, exact: true }).click(); await page.getByRole("option", { name: t.horizons["3"], exact: true }).click();
  await expect(page).toHaveURL(/horizon=3/);
  await expect(comparison.getByRole("cell", { name: "60,100.00", exact: true })).toBeVisible();
  await page.getByRole("button", { name: t.monthlyCash, exact: false }).click();
  await expect(page.getByRole("table", { name: t.cashProjection }).locator("tbody tr")).toHaveCount(3);
  for (const horizon of ["12", "year", "6"]) {
    await page.getByRole("combobox", { name: t.horizon, exact: true }).click(); await page.getByRole("option", { name: t.horizons[horizon as keyof typeof t.horizons], exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`horizon=${horizon}`));
    if (horizon !== "year") await expect(page.getByRole("table", { name: t.cashProjection }).locator("tbody tr")).toHaveCount(Number(horizon));
  }
  await page.getByRole("button", { name: t.saveSnapshot, exact: false }).click();
  await page.getByLabel(t.snapshotName, { exact: true }).fill("Month close expectations"); await page.getByLabel(t.snapshotName, { exact: true }).locator("xpath=ancestor::form").getByRole("button", { name: en.Finance.planning.save, exact: true }).click();
  await expect(page.getByRole("heading", { name: /Month close expectations/ })).toBeVisible();
  const frozen = sql(`select forecast from public.finance_forecast_snapshots where studio_id='${studio}'`);
  // A later cash event on the SAME day must be included in saved-vs-actual comparison.
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','50','accountId','${bank}','categoryId','${category}'));`);
  await page.reload(); await expect(page.getByRole("cell", { name: "50.00", exact: true })).toBeVisible();
  expect(sql(`select forecast from public.finance_forecast_snapshots where studio_id='${studio}'`)).toBe(frozen);
  const savedUrl = page.url();
  await page.goto(`${savedUrl}&fx_USD=0`);
  await expect(page.getByRole("alert").filter({ hasText: t.invalidManualFx })).toBeVisible();
  await page.goto(savedUrl);
  await expect(page.getByRole("link", { name: t.modes.history, exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("finance-planning-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 }); await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: "http://127.0.0.1:3100" }]); await page.reload();
  await expect(page.getByRole("heading", { name: uk.Finance.forecast.title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("finance-planning-mobile.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});
test("employee cannot access cash planning", async ({ page }) => {
  await login(page, 1); await page.goto("/finance/planning"); await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: t.title, exact: true })).toHaveCount(0);
});

// Independent real PostgreSQL sessions; markers and lock observations avoid timing sleeps.
function session(name: string) {
  const child = spawn("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"]);
  return {
    run(statement: string): Promise<string> {
      const marker = randomUUID();
      return new Promise((resolve, reject) => {
        let output = "", errors = "";
        const timeout = setTimeout(() => { cleanup(); reject(new Error(`Session ${name} timed out: ${errors}`)); }, 20000);
        const onData = (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes(marker)) { cleanup(); resolve(output.slice(0, output.indexOf(marker)).trim()); }
        };
        const onError = (chunk: Buffer) => { errors += chunk.toString(); };
        const onExit = () => { cleanup(); reject(new Error(`Session ${name} exited: ${errors}`)); };
        function cleanup() { clearTimeout(timeout); child.stdout.off("data", onData); child.stderr.off("data", onError); child.off("exit", onExit); }
        child.stdout.on("data", onData); child.stderr.on("data", onError); child.once("exit", onExit);
        child.stdin.write(`${statement}\n\\echo ${marker}\n`);
      });
    },
    close() { child.stdin.end("rollback;\n\\q\n"); },
  };
}

test("snapshot capture follows real posting order across concurrent transactions and retries", async () => {
  const item = sql(`select id from public.finance_expected_items where studio_id='${studio}' and description='Contract receipt'`);
  const post = (request: string, amount: number) => `select public.record_finance_expected_payment('${studio}','${request}','${item}',jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','${amount}','accountId','${bank}','categoryId','${category}'),${amount});`;
  const auth = `set role authenticated;select set_config('request.jwt.claim.sub','${actors[0].id}',false);`;
  for (const order of ["payment-starts-first", "snapshot-starts-first", "payment-posts-first"]) await test.step(order, async () => {
    const movement = session(`payment-${order}`), capture = session(`capture-${order}`);
    const request = randomUUID(), paymentRequest = randomUUID();
    const save = `select public.save_finance_forecast_snapshot('${studio}','${request}','${order}','6','confirmed','[]');`;
    const begin = (name: string) => `${auth}set application_name='${name}';begin;set local lock_timeout='15s';`;
    const waiting = (name: string) => expect.poll(() => sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock'`)).toBe("1");
    try {
      // Every capture also has a fully committed preceding payment.
      sql(auth + post(randomUUID(), 7));
      if (order === "payment-starts-first") {
        await movement.run(begin(`payment-${order}`));
        await capture.run(begin(`capture-${order}`));
      } else {
        await capture.run(begin(`capture-${order}`));
        await movement.run(begin(`payment-${order}`));
      }
      let snapshot: string;
      if (order === "payment-posts-first") {
        await movement.run(post(paymentRequest, 10));
        const pending = capture.run(save); // Its transaction predates the included payment.
        await waiting(`capture-${order}`);
        await movement.run("commit;");
        snapshot = await pending;
        await capture.run("commit;");
      } else {
        snapshot = await capture.run(save);
        const pending = movement.run(post(paymentRequest, 10) + "commit;");
        await waiting(`payment-${order}`);
        await capture.run("commit;");
        await pending;
      }
      expect(sql(`select (s.forecast->>'cashBase')::numeric=b.recorded_balance-${order === "payment-posts-first" ? 0 : 10} from public.finance_forecast_snapshots s join public.finance_account_balances b on b.studio_id=s.studio_id where s.id='${snapshot}' and b.id='${bank}'`)).toBe("t");
      const frozen = sql(`select forecast::text||'|'||capture_order from public.finance_forecast_snapshots where id='${snapshot}'`);
      const compare = () => sql(auth + `select sum((m->>'actual')::numeric) from jsonb_array_elements(public.compare_finance_forecast_snapshot('${studio}','${snapshot}')) m;`).split("\n").at(-1);
      expect(compare()).toBe(order === "payment-posts-first" ? "0" : "10.00");
      sql(auth + post(randomUUID(), 20));
      sql(auth + post(paymentRequest, 10)); // Retry must not acquire another posting order or add cash.
      expect(compare()).toBe(order === "payment-posts-first" ? "20.00" : "30.00");
      expect(sql(auth + save).split("\n").at(-1)).toBe(snapshot);
      expect(sql(`select forecast::text||'|'||capture_order from public.finance_forecast_snapshots where id='${snapshot}'`)).toBe(frozen);
      const timestampDirection = sql(`select m.created_at < s.created_at from public.finance_movements m cross join public.finance_forecast_snapshots s where m.request_id='${paymentRequest}' and s.id='${snapshot}'`);
      expect(timestampDirection).toBe(order === "payment-starts-first" ? "t" : "f");
    } finally { movement.close(); capture.close(); }
  });
});

test("legacy snapshots keep saved expectations without claiming an unreliable comparison", async ({ page }) => {
  const legacy = randomUUID();
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    select public.save_finance_forecast_snapshot('${studio}',gen_random_uuid(),'Legacy source','6','confirmed','[]');
    begin;set local session_replication_role=replica;
    insert into public.finance_forecast_snapshots(id,studio_id,name,forecast,created_by,created_at)
    select '${legacy}',studio_id,'Legacy capture',forecast,created_by,created_at from public.finance_forecast_snapshots where studio_id='${studio}' limit 1;commit;`);
  await login(page); await page.goto(`/finance/planning?snapshot=${legacy}`);
  await expect(page.getByText(t.legacySnapshot, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Legacy capture/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "—", exact: true }).first()).toBeVisible();
});

test("planning visual states reconcile with canonical cash across sizes, languages and themes", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const outgoing = sql(`select id from public.finance_categories where studio_id='${studio}' and direction='outgoing' and nature='operating' limit 1`);
  const owner = sql(`select id from public.finance_categories where studio_id='${studio}' and nature='owner_distribution' limit 1`);
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    do $$begin
      for m in 1..5 loop
        perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','outgoing','amount','28000','currency','UAH','categoryId','${outgoing}','description','Monthly operating payment','expectedDate',(date_trunc('month',now() at time zone 'Europe/Kyiv') + make_interval(months=>m) + interval '4 days')::date,'commitment','agreed','certainty','fixed'));
        perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','17000','currency','UAH','categoryId','${category}','description','Agreed milestone','expectedDate',(date_trunc('month',now() at time zone 'Europe/Kyiv') + make_interval(months=>m) + interval '19 days')::date,'commitment','agreed','certainty','fixed'));
      end loop;
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','2500','currency','EUR','categoryId','${category}','description','Euro milestone','expectedDate',((now() at time zone 'Europe/Kyiv')::date+35),'commitment','agreed','certainty','fixed'));
      perform public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','outgoing','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1000','accountId','${bank}','categoryId','${outgoing}'));
      perform public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','owner_withdrawal','date',(now() at time zone 'Europe/Kyiv')::date,'amount','500','accountId','${bank}','categoryId','${owner}'));
      perform public.save_finance_budget('${studio}',gen_random_uuid(),jsonb_build_object('categoryId','${outgoing}','year',extract(year from now() at time zone 'Europe/Kyiv'),'revision',0,'reason','Annual operating plan','months',to_jsonb(array_fill('28000'::text,array[12]))));
      perform public.save_finance_budget('${studio}',gen_random_uuid(),jsonb_build_object('categoryId','${owner}','year',extract(year from now() at time zone 'Europe/Kyiv'),'revision',0,'reason','Approved distributions','months',to_jsonb(array_fill('500'::text,array[12]))));
    end $$;`);
  await login(page);
  await page.goto("/finance/planning?fx_EUR=45");
  await expect(page.getByRole("combobox", { name: t.horizon, exact: true })).toContainText(t.horizons["6"]);
  await expect(page.getByRole("combobox", { name: t.scenario, exact: true })).toContainText(t.confirmed);
  const canonical = financeOverviewSchema.parse(JSON.parse(sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.get_finance_overview('${studio}','6','confirmed',jsonb_build_array(jsonb_build_object('currency','EUR','rate','45','source','manual','effectiveDate',(now() at time zone 'Europe/Kyiv')::date)),'3')`).split("\n").at(-1) ?? "{}"));
  const exact = (value: string) => new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
  const summaries = page.locator("dl");
  await expect(summaries).toContainText(exact(canonical.forecast.cashBase));
  await expect(summaries).toContainText(exact(canonical.forecast.months.at(-1)?.closing ?? "0"));
  await expect(summaries).toContainText(exact(canonical.lowPoint.amount));
  await page.getByRole("group", { name: en.Finance.overview.cashChart }).getByRole("button").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[aria-live="polite"]')).not.toHaveText(en.Finance.overview.chartInteraction);
  await page.getByRole("button", { name: t.saveSnapshot, exact: false }).click();
  await page.getByLabel(t.snapshotName, { exact: true }).fill("Quarterly cash outlook");
  await page.getByLabel(t.snapshotName, { exact: true }).locator("xpath=ancestor::form").getByRole("button", { name: en.Finance.planning.save, exact: true }).click();
  await expect(page.getByRole("heading", { name: /Quarterly cash outlook/ })).toBeVisible();
  const savedUrl = page.url();
  for (const language of ["en", "uk"] as const) for (const theme of ["light", "dark"] as const) {
    await page.context().addCookies([{ name: "studioflow-locale", value: language, url: "http://127.0.0.1:3100" }]);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const financeLabels = language === "en" ? en.Finance : uk.Finance;
    const labels = language === "en" ? en.Finance.forecast : uk.Finance.forecast;
    for (const [size, width, height] of [["fullhd", 1920, 1080], ["2k", 2560, 1440], ["mobile", 375, 900]] as const) {
      await page.setViewportSize({ width, height });
      for (const mode of ["forecast", "budget", "history"] as const) {
        const url = new URL(savedUrl); url.searchParams.set("mode", mode);
        await page.goto(url.toString());
        await expect(page.getByRole("link", { name: labels.modes[mode], exact: true })).toHaveAttribute("aria-current", "page");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.screenshot({ path: testInfo.outputPath(`${mode}-${size}-${language}-${theme}.png`), fullPage: true });
        if (mode === "forecast") {
          if (size === "fullhd") {
            await page.getByRole("combobox", { name: labels.horizon, exact: true }).click();
            await expect(page.getByRole("option", { name: labels.horizons["12"], exact: true })).toBeVisible();
            await page.screenshot({ path: testInfo.outputPath(`forecast-select-${language}-${theme}.png`) });
            await page.keyboard.press("Escape");
          }
          await page.getByRole("button", { name: labels.saveSnapshot, exact: true }).click();
          const snapshotInput = page.getByLabel(labels.snapshotName, { exact: true });
          await expect(snapshotInput).toBeVisible();
          if (size === "mobile") await expect(page.getByRole("dialog", { name: labels.saveSnapshot })).toBeVisible();
          else await expect(page.getByRole("dialog", { name: labels.saveSnapshot })).toHaveCount(0);
          expect((await snapshotInput.locator("xpath=ancestor::form").boundingBox())?.height).toBeLessThan(300);
          await page.screenshot({ path: testInfo.outputPath(`snapshot-${size}-${language}-${theme}.png`) });
          await page.keyboard.press("Escape");
          for (const name of [labels.attention.split("{count}")[0].trim(), labels.monthlyCash, labels.comparison, labels.datedItems.split("{count}")[0].trim(), labels.fxTitle, labels.forecastBasis]) {
            const button = page.getByRole("button", { name, exact: false });
            if (await button.getAttribute("aria-expanded") === "false") await button.click();
          }
          const regions = page.locator('[role="region"][aria-hidden="false"]');
          for (const region of await regions.all()) {
            await expect.poll(() => region.evaluate(el => Math.abs(el.getBoundingClientRect().height - (el.firstElementChild?.getBoundingClientRect().height ?? 0)))).toBeLessThan(1);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.getByRole("heading", { name: labels.title, exact: true }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`all-details-${size}-${language}-${theme}.png`) });
          const monthlyTable = page.getByRole("table", { name: labels.cashProjection });
          await monthlyTable.scrollIntoViewIfNeeded();
          if (size === "mobile") expect(await monthlyTable.evaluate(el => el.parentElement !== null && el.parentElement.scrollWidth <= el.parentElement.clientWidth)).toBe(true);
          await page.screenshot({ path: testInfo.outputPath(`tables-${size}-${language}-${theme}.png`) });
          await page.getByRole("button", { name: labels.fxTitle, exact: false }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`assumptions-${size}-${language}-${theme}.png`) });
        }
        if (mode === "budget" && size === "fullhd") {
          const year = page.getByLabel(labels.year, { exact: true });
          await expect(year).toHaveCSS("appearance", "none");
          await page.getByRole("combobox", { name: labels.category, exact: true }).click();
          expect(await page.getByRole("option").count()).toBeGreaterThan(10);
          const categorySearch = page.getByRole("combobox", { name: financeLabels.planning.searchCategories, exact: true });
          await categorySearch.fill(financeLabels.planning.defaults.salary.slice(0, 3));
          await expect(page.getByRole("option", { name: new RegExp(financeLabels.planning.defaults.salary) })).toBeVisible();
          await page.screenshot({ path: testInfo.outputPath(`budget-category-search-${language}-${theme}.png`) });
          await page.keyboard.press("Escape");
          await page.getByRole("button", { name: labels.approveBudget, exact: true }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`budget-editor-${language}-${theme}.png`) });
        }
      }
    }
  }
  await page.context().addCookies([{ name: "studioflow-locale", value: "en", url: "http://127.0.0.1:3100" }]);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/finance/planning?fx_EUR=45&scenario=planned");
  await expect(page.getByRole("combobox", { name: t.scenario, exact: true })).toContainText(t.planned);
  await page.screenshot({ path: testInfo.outputPath("forecast-planned.png"), fullPage: true });
  await page.getByRole("button", { name: t.fxTitle, exact: false }).click();
  await expect(page.getByText("EUR → UAH: 45", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: t.manualRate.replace("{currency}", "EUR").replace("{reporting}", "UAH"), exact: true }).fill("46");
  await page.getByRole("button", { name: t.applyFx, exact: true }).click();
  await expect(page).toHaveURL(/fx_EUR=46/);
  await expect(page.getByRole("combobox", { name: t.scenario, exact: true })).toContainText(t.planned);
  await page.getByRole("button", { name: t.fxTitle, exact: false }).click();
  await expect(page.getByRole("textbox", { name: t.manualRate.replace("{currency}", "EUR").replace("{reporting}", "UAH"), exact: true })).toHaveValue("46");
  await page.goto("/finance/planning");
  await page.getByRole("button", { name: t.attention.split("{count}")[0].trim(), exact: false }).click();
  await expect(page.getByText(t.incomplete, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: t.fxTitle, exact: false }).click();
  await expect(page.getByRole("textbox", { name: t.manualRate.replace("{currency}", "EUR").replace("{reporting}", "UAH"), exact: true })).toHaveValue("");
  await page.screenshot({ path: testInfo.outputPath("forecast-without-manual-fx.png"), fullPage: true });
  expect(errors).toEqual([]);
});
