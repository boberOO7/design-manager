import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";
import { convertFinanceDisplayAmount } from "../../src/lib/finance-display-report";
const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Finance fixtures only");
const client = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), bank = randomUUID();
const actors = ["admin", "employee"].map(role => ({ role, id: "", email: `overview-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` }));
const setupStudio = randomUUID();
const setupActor = { id: "", email: `overview-setup-${randomUUID()}@example.test`, password: `Finance-${randomUUID()}` };
const t = en.Finance.overview;
const f = en.Finance.forecast;
const foreign = randomUUID(), secondBank = randomUUID();
function sql(statement: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim(); }
async function login(page: Page, index = 0) { await signInLocalTestUser(page, actors[index]); }
let category = "";
function checkMotion(motion: MotionProbe) {
  expect(motion.globalReveals).toBe(0);
  const counts = new Map<number, number>();
  for (const start of motion.starts) counts.set(start.id, (counts.get(start.id) ?? 0) + 1);
  expect([...counts.values()].every(count => count === 1)).toBe(true);
  expect(motion.maxMaskBacktrack).toBeLessThan(0.05);
}

type NavigationTiming = { start: number; shell: number | null; analytics: number | null; cash: number | null; firstUsable: number | null; full: number | null; cls: number; shifts: number };
type MotionProbe = { starts: { scope: string; id: number }[]; globalReveals: number; maxMaskBacktrack: number };
declare global { interface Window { financeNavigationTiming: NavigationTiming | null; financeMotionProbe: MotionProbe } }

async function installFinanceProbe(page: Page, documentNavigation = false) {
  await page.addInitScript(({ documentNavigation }) => {
    const fresh = (start: number): NavigationTiming => ({ start, shell: null, analytics: null, cash: null, firstUsable: null, full: null, cls: 0, shifts: 0 });
    window.financeNavigationTiming = documentNavigation ? fresh(0) : null;
    window.financeMotionProbe = { starts: [], globalReveals: 0, maxMaskBacktrack: 0 };
    const entries = new WeakMap<Element, { id: number; mask: number }>();
    let id = 0;
    let globallyRevealing = false;
    document.addEventListener("click", event => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (link && new URL(link.href).pathname === "/finance") {
        window.financeNavigationTiming = fresh(performance.now());
        window.financeMotionProbe = { starts: [], globalReveals: 0, maxMaskBacktrack: 0 };
      }
    }, true);
    document.addEventListener("animationstart", event => {
      if (event.animationName !== "dashboard-row-enter" || !(event.target instanceof HTMLElement) || !event.target.closest("#main-content")) return;
      const scope = event.target.closest<HTMLElement>("[data-instaload-ready]")?.dataset.instaloadReady;
      if (!scope?.startsWith("finance-")) return;
      const entry = entries.get(event.target) ?? { id: ++id, mask: 100 };
      entries.set(event.target, entry);
      window.financeMotionProbe.starts.push({ scope, id: entry.id });
    }, true);
    const observe = () => {
      const timing = window.financeNavigationTiming;
      const root = document.querySelector<HTMLElement>("#main-content");
      if (!timing || location.pathname !== "/finance" || !root) return;
      const elapsed = performance.now() - timing.start;
      if (root.querySelector("[data-finance-shell] h1")) timing.shell ??= elapsed;
      if (root.querySelector('[data-testid="finance-analytics"]')) timing.analytics ??= elapsed;
      if (root.querySelector('[data-testid="finance-cash"]')) timing.cash ??= elapsed;
      const ready = (scope: string) => root.querySelector(`[data-instaload-ready="${scope}"][data-instaload-entrance="ready"]`);
      const analytics = ready("finance-analytics"), cash = ready("finance-cash");
      if (analytics || cash) timing.firstUsable ??= elapsed;
      if (analytics && cash && root.querySelector('button[role="combobox"]:not(:disabled)')) timing.full ??= elapsed;
      const revealing = root.dataset.pageNavigation === "revealing";
      if (revealing && !globallyRevealing) window.financeMotionProbe.globalReveals++;
      globallyRevealing = revealing;
      root.querySelectorAll<HTMLElement>('[data-instaload-arrival^="finance-"]').forEach(element => {
        const clip = getComputedStyle(element).clipPath.match(/^inset\(([^)]+)\)/);
        const parts = clip?.[1].split(/\s+/);
        const mask = parts ? parseFloat(parts[2] ?? parts[0]) : 0;
        const entry = entries.get(element) ?? { id: ++id, mask };
        entries.set(element, entry);
        window.financeMotionProbe.maxMaskBacktrack = Math.max(window.financeMotionProbe.maxMaskBacktrack, mask - entry.mask);
        entry.mask = mask;
      });
    };
    new MutationObserver(observe).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-instaload-entrance", "data-page-navigation"] });
    const frame = () => { observe(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    new PerformanceObserver(list => {
      const timing = window.financeNavigationTiming;
      if (!timing || location.pathname !== "/finance") return;
      for (const entry of list.getEntries()) {
        if (entry.startTime < timing.start || !("value" in entry) || typeof entry.value !== "number") continue;
        timing.shifts += entry.value;
        if ("hadRecentInput" in entry && entry.hadRecentInput === false) timing.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  }, { documentNavigation });
}

test("five warmed Finance navigations preserve values and measure shell, sections and CLS", async ({ page }, testInfo) => {
  await installFinanceProbe(page);
  await login(page);
  const measurements = [];
  const motions = [];
  let values = { analytics: "", cash: "" };
  for (let visit = 0; visit < 6; visit++) {
    await page.locator('aside nav a[href="/finance"]').click();
    await expect(page.locator("#main-content").getByTestId("finance-analytics")).toBeVisible();
    await expect(page.locator("#main-content").getByTestId("finance-cash")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const timing = await page.evaluate(() => window.financeNavigationTiming);
    expect(timing?.shell).not.toBeNull();
    expect(timing?.analytics).not.toBeNull();
    expect(timing?.cash).not.toBeNull();
    expect(timing?.firstUsable).not.toBeNull();
    expect(timing?.full).not.toBeNull();
    const motion = await page.evaluate(() => window.financeMotionProbe);
    checkMotion(motion);
    if (visit > 0) measurements.push(timing);
    if (visit > 0) motions.push(motion);
    const current = { analytics: await page.locator("#main-content").getByTestId("finance-analytics").innerText(), cash: await page.locator("#main-content").getByTestId("finance-cash").innerText() };
    if (visit > 0) expect(current).toEqual(values);
    values = current;
    await page.locator('aside nav a[href="/contractors"]').click();
    await expect(page).toHaveURL(/\/contractors$/);
    await page.waitForLoadState("networkidle");
  }
  await testInfo.attach("finance-navigation", { body: JSON.stringify({ measurements, motions, values }, null, 2), contentType: "application/json" });
});

async function holdFinanceData(section: "foundation" | "analytics" | "cash") {
  const connection = spawn("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { stdio: ["pipe", "pipe", "pipe"] });
  let errors = "";
  connection.stderr.on("data", chunk => { errors += String(chunk); });
  connection.stdin.on("error", error => { errors += error.message; });
  const finished = new Promise<void>((resolve, reject) => {
    connection.on("error", reject);
    connection.on("close", code => code === 0 ? resolve() : reject(new Error(`Finance delay connection failed: ${errors}`)));
  });
  const ready = new Promise<void>(resolve => {
    connection.stdout.on("data", chunk => { if (String(chunk).includes("finance-delay-ready")) resolve(); });
  });
  const lock = section === "cash" ? `select 1 from public.finance_settings where studio_id='${z.uuid().parse(studio)}' for update;`
    : `lock table public.${section === "foundation" ? "finance_accounts" : "finance_report_coverage"} in access exclusive mode;`;
  connection.stdin.write(`begin; set local idle_in_transaction_session_timeout='20s'; ${lock} select 'finance-delay-ready';\n`);
  await Promise.race([ready, finished.then(() => { throw new Error("Finance delay connection closed before acquiring the lock"); })]);
  return async () => {
    if (connection.exitCode === null && !connection.stdin.destroyed) connection.stdin.end("rollback;\n\\q\n");
    await finished;
  };
}

for (const section of ["foundation", "analytics", "cash"] as const) {
  test(`delayed ${section} keeps the Finance shell visible and sibling sections independent`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await installFinanceProbe(page, true);
    await login(page);
    // Warm modules before holding a short, rollback-only local data lock.
    await page.goto("/finance?fx_USD=40");
    await expect(page.locator("#main-content").getByTestId("finance-cash")).toBeVisible();
    await expect(page.locator("#main-content").getByTestId("finance-analytics")).toBeVisible();
    await page.goto("/contractors");
    await page.waitForLoadState("networkidle");
    const release = await holdFinanceData(section);
    try {
      await page.goto("/finance?fx_USD=40", { waitUntil: "commit" });
      await expect(page.getByRole("heading", { name: t.title, exact: true })).toBeVisible();
      await expect(page.locator("#main-content")).toHaveAttribute("data-page-navigation", "ready");
      if (section === "foundation") {
        await expect(page.locator('[data-finance-shell="loading"]')).toBeVisible();
        await expect(page.locator("#main-content").getByTestId("finance-analytics")).toHaveCount(0);
        await expect(page.locator("#main-content").getByTestId("finance-cash")).toHaveCount(0);
      } else {
        const delayed = section === "analytics" ? "finance-analytics" : "finance-cash";
        const sibling = section === "analytics" ? "finance-cash" : "finance-analytics";
        await expect(page.locator("#main-content").getByTestId(sibling)).toBeVisible();
        await expect(page.locator("#main-content").getByTestId(delayed)).toHaveCount(0);
        await expect(page.getByRole("region", { name: section === "analytics" ? t.analytics.headline : t.analytics.cashOutlook, exact: true })).toHaveAttribute("aria-busy", "true");
      }
      expect(await page.locator('.instaload-blueprint .instaload-mark').evaluateAll(elements => elements.every(element => !element.textContent?.trim()))).toBe(true);
      // Let the delay outlast CLS's recent-input exclusion window.
      await page.waitForTimeout(650);
    } finally { await release(); }
    const cash = page.locator("#main-content").getByTestId("finance-cash").getByRole("link", { name: t.cash, exact: true }).locator("../..");
    await expect(cash).toContainText("40,898.00");
    await expect(page.locator("#main-content").getByTestId("finance-analytics")).toContainText(t.analytics.activationNeeded);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-instaload-ready="finance-cash"]')).toHaveAttribute("data-instaload-entrance", "ready");
    const result = await page.evaluate(() => ({ timing: window.financeNavigationTiming, motion: window.financeMotionProbe }));
    checkMotion(result.motion);
    await testInfo.attach(`finance-${section}-layout`, { body: JSON.stringify(result), contentType: "application/json" });
    expect(errors).toEqual([]);
  });
}

test("display currency refresh preserves exact converted cash and native account values", async ({ page }) => {
  await installFinanceProbe(page, true);
  await login(page);
  await page.goto("/finance?fx_USD=40");
  const control = page.getByRole("combobox", { name: en.Finance.displayCurrency, exact: true });
  const cash = page.locator("#main-content").getByTestId("finance-cash");
  await expect(cash).toContainText("40,898.00");
  const today = sql("select (now() at time zone 'Europe/Kyiv')::date;");
  const date = today.replaceAll("-", "");
  const response = await page.request.get(`https://bank.gov.ua/NBU_Exchange/exchange_site?start=${date}&end=${date}&valcode=usd&sort=exchangedate&order=desc&json`);
  expect(response.ok()).toBe(true);
  const rates = z.array(z.object({ cc: z.string(), rate_per_unit: z.number().positive() })).parse(await response.json());
  const usd = rates.find(rate => rate.cc === "USD");
  if (!usd) throw new Error("Official USD rate unavailable for the fixture date");
  const rate = (1 / usd.rate_per_unit).toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  const expected = new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(convertFinanceDisplayAmount("40898.00", rate, 2)));
  try {
    await control.click();
    await page.getByRole("option", { name: "USD", exact: true }).click();
    await expect(control).toHaveText("USD");
    await expect(cash.getByRole("link", { name: t.cash, exact: true }).locator("../..")).toContainText(expected);
    await expect(cash.getByRole("link", { name: t.cash, exact: true }).locator("../..")).toContainText("USD");
    await expect(page.locator("#main-content").getByTestId("finance-analytics")).toContainText("USD");
    const user = await client.auth.admin.getUserById(actors[0].id);
    expect(user.data.user?.user_metadata.finance_display_currency).toBe("USD");
    await cash.getByRole("button", { name: t.breakdown, exact: true }).click();
    await expect(page.locator("#overview-breakdown")).toContainText("10.00 USD");
    await control.click();
    await page.getByRole("option", { name: "UAH", exact: true }).click();
    await expect(cash.getByRole("link", { name: t.cash, exact: true }).locator("../..")).toContainText("40,898.00");
    await page.waitForLoadState("networkidle");
    checkMotion(await page.evaluate(() => window.financeMotionProbe));
  } finally {
    const result = await client.auth.admin.updateUserById(actors[0].id, { user_metadata: { finance_display_currency: "UAH" } });
    if (result.error) throw result.error;
  }
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`mobile Finance reveal plays once with ${reducedMotion} motion`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion });
    await installFinanceProbe(page);
    await login(page);
    await page.getByRole("button", { name: en.Navigation.open, exact: true }).click();
    await page.locator('#mobile-application-navigation a[href="/finance"]').click();
    await expect(page.locator("#main-content").getByTestId("finance-cash")).toBeVisible();
    await expect(page.locator("#main-content").getByTestId("finance-analytics")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const result = await page.evaluate(() => ({ timing: window.financeNavigationTiming, motion: window.financeMotionProbe, overflow: document.documentElement.scrollWidth > innerWidth }));
    checkMotion(result.motion);
    expect(result.overflow).toBe(false);
    if (reducedMotion === "reduce") {
      expect(result.motion.starts).toEqual([]);
      expect(await page.locator('#main-content [data-instaload-arrival="finance-cash"]').evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    }
  });
}

test("draft setup finalizes through Finance and locks finalized account openings", async ({ page }) => {
  await signInLocalTestUser(page, setupActor);
  await page.goto("/finance");
  const settings = en.Finance;
  await expect(page.getByRole("heading", { name: settings.title, exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: settings.baseCurrency, exact: true }).click();
  await page.getByRole("option", { name: "UAH", exact: true }).click();
  await page.getByRole("button", { name: settings.saveSettings }).click();
  await expect(page.getByRole("button", { name: settings.reviewFinalize })).toBeDisabled();
  await page.getByRole("button", { name: settings.addAccount, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(settings.accountName, { exact: true }).fill("Acceptance bank");
  await dialog.getByLabel(settings.openingBalance, { exact: true }).fill("1234.567");
  await dialog.getByRole("button", { name: settings.saveAccount }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel(settings.openingBalance, { exact: true }).fill("1234.56");
  await dialog.getByRole("button", { name: settings.saveAccount }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: settings.reviewFinalize }).click();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: settings.finalize, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: t.title, exact: true })).toBeVisible();
  await expect(page.locator("#main-content").getByTestId("finance-cash")).toContainText("1,234.56");
  expect(sql(`select base_currency || ':' || (finalized_at is not null) from public.finance_settings where studio_id='${z.uuid().parse(setupStudio)}';`)).toBe("UAH:true");
  await page.goto("/finance/accounts");
  await page.getByRole("button", { name: settings.balance.actionsFor.replace("{name}", "Acceptance bank"), exact: true }).click();
  await page.getByRole("menuitem", { name: settings.edit, exact: true }).click();
  await expect(dialog.getByLabel(settings.openingBalance, { exact: true })).toHaveAttribute("readonly");
  await expect(dialog.getByRole("textbox", { name: settings.currency, exact: true })).toHaveAttribute("readonly");
  await expect(dialog.getByRole("textbox", { name: settings.currency, exact: true })).toHaveValue("UAH");
  await dialog.getByRole("button", { name: settings.close, exact: true }).click();
});

test.beforeAll(async () => {
  await client.from("studios").insert([{ id: studio, name: "Forecast browser test" }, { id: setupStudio, name: "Finance setup acceptance" }]).throwOnError();
  const setup = await client.auth.admin.createUser({ email: setupActor.email, password: setupActor.password, email_confirm: true, user_metadata: { finance_display_currency: "UAH" } });
  if (setup.error) throw setup.error;
  setupActor.id = setup.data.user.id;
  await client.from("profiles").upsert({ id: setupActor.id, email: setupActor.email, full_name: "Finance setup admin", system_role: "admin", is_active: true }).throwOnError();
  await client.from("studio_members").insert({ studio_id: setupStudio, user_id: setupActor.id, system_role: "admin" }).throwOnError();
  for (const actor of actors) {
    const { data, error } = await client.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true, user_metadata: { finance_display_currency: "UAH" } }); if (error) throw error; actor.id = data.user.id;
    await client.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: `Forecast ${actor.role}`, system_role: actor.role, is_active: true }).throwOnError();
    await client.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: actor.role, joined_at: "2026-01-01" }).throwOnError();
  }
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH',date_trunc('month',now() at time zone 'Europe/Kyiv')::date,'${actors[0].id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','Bank','UAH',1000,'${actors[0].id}'),('${foreign}','${studio}','Dollar bank','USD',0,'${actors[0].id}'),('${secondBank}','${studio}','Second bank','UAH',0,'${actors[0].id}');
    select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.finalize_finance_setup('${studio}');`);
  category = sql(`select id from public.finance_categories where studio_id='${studio}' and default_key='project_payments'`);
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    do $$declare item uuid; begin
      item:=public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','100000','currency','UAH','categoryId','${category}','established',true,'description','Contract receipt','dueDate',(now() at time zone 'Europe/Kyiv')::date,'expectedDate',(now() at time zone 'Europe/Kyiv')::date,'commitment','agreed','certainty','fixed'));
      perform public.record_finance_expected_payment('${studio}',gen_random_uuid(),item,jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','40000','accountId','${bank}','categoryId','${category}'),40000);
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','100','currency','UAH','categoryId','${category}','description','Tentative receipt','expectedDate',(now() at time zone 'Europe/Kyiv')::date,'commitment','tentative','certainty','estimated'));
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','incoming','amount','75','currency','UAH','categoryId','${category}','established',true,'description','Undated receipt','commitment','agreed','certainty','fixed'));
      perform public.save_finance_expected_item('${studio}',gen_random_uuid(),jsonb_build_object('direction','outgoing','amount','120','currency','UAH','categoryId',(select id from public.finance_categories where studio_id='${studio}' and default_key='rent'),'description','Overdue rent','dueDate',(now() at time zone 'Europe/Kyiv')::date-1,'commitment','agreed','certainty','fixed'));
      perform public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','owner_withdrawal','date',(now() at time zone 'Europe/Kyiv')::date,'amount','500','accountId','${bank}','categoryId',(select id from public.finance_categories where studio_id='${studio}' and default_key='owner_distribution')));
      perform public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','transfer','category','Transfer','date',(now() at time zone 'Europe/Kyiv')::date,'amount','100','accountId','${bank}','destinationId','${secondBank}','receivedAmount','100','fee','2'));
      perform public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','10','accountId','${foreign}','categoryId','${category}','fx',jsonb_build_object('rate','39','source','manual','effectiveDate',(now() at time zone 'Europe/Kyiv')::date)));
      perform public.save_finance_budget('${studio}',gen_random_uuid(),jsonb_build_object('categoryId','${category}','year',extract(year from now() at time zone 'Europe/Kyiv'),'revision',0,'months',to_jsonb(array_fill(100000,ARRAY[12])),'reason','Overview reference'));
    end $$;`);
});
test.afterAll(async () => {
  for (const fixtureStudio of [studio, setupStudio]) {
  sql(`begin;set local session_replication_role=replica;
    delete from private.finance_labor_membership_events where studio_id='${fixtureStudio}';
    delete from public.finance_report_coverage where studio_id='${fixtureStudio}';delete from public.finance_recognition_entries where studio_id='${fixtureStudio}';delete from public.projects where studio_id='${fixtureStudio}';
    delete from public.finance_forecast_snapshots where studio_id='${fixtureStudio}';delete from public.finance_budget_revisions where studio_id='${fixtureStudio}';
    delete from public.finance_allocations where studio_id='${fixtureStudio}';delete from public.finance_expected_items where studio_id='${fixtureStudio}';
    delete from public.finance_planning_requests where studio_id='${fixtureStudio}';delete from public.finance_movement_entries where studio_id='${fixtureStudio}';delete from public.finance_movements where studio_id='${fixtureStudio}';
    delete from public.finance_accounts where studio_id='${fixtureStudio}';delete from public.finance_categories where studio_id='${fixtureStudio}';delete from public.finance_settings where studio_id='${fixtureStudio}';
    delete from public.notifications where studio_id='${fixtureStudio}';delete from public.studio_members where studio_id='${fixtureStudio}';delete from public.studios where id='${fixtureStudio}';commit;`);
  }
  for (const actor of [...actors, setupActor]) if (actor.id) { const { error } = await client.auth.admin.deleteUser(actor.id); if (error) throw error; }
});
test("Overview summarizes canonical cash and links to the owning workflows", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page); await page.goto("/finance?fx_USD=40");
  const cash = page.locator("#main-content").getByTestId("finance-cash").getByRole("link", { name: t.cash, exact: true }).locator("../..");
  await expect(cash).toContainText("40,898.00");
  await page.getByRole("button", { name: t.netFlow, exact: true }).click();
  await expect(page.getByText(/39,888.00 UAH/)).toBeVisible();
  await expect(page.getByRole("link", { name: t.outgoing, exact: true }).locator("../..")).toContainText("120.00");
  await expect(page.getByRole("link", { name: t.overdue, exact: true }).locator("../..")).toContainText("1");
  await expect(page.getByLabel(f.horizon, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(f.scenario, { exact: true })).toHaveCount(0);
  await expect(page.getByText(f.fxTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table", { name: t.budgetComparison })).toHaveCount(0);
  await page.getByRole("button", { name: t.breakdown, exact: true }).click(); await expect(page.locator("#overview-breakdown")).toContainText("Dollar bank");
  await expect(page.locator("#overview-breakdown")).toContainText("400.00"); await page.getByRole("button", { name: t.breakdown, exact: true }).click();
  await page.locator("#main-content").getByTestId("finance-cash").getByText(t.chartData, { exact: true }).click();
  const chart = page.getByRole("table", { name: t.cashChart });
  await expect(chart).toContainText("40,888.00"); await expect(chart).toContainText("40,898.00");
  await expect(chart).toContainText("100,778.00");
  await page.locator("#main-content").getByTestId("finance-cash").getByText(t.chartData, { exact: true }).click();
  await expect(page.locator("#main-content").getByTestId("finance-cash")).toContainText("Overdue rent");
  await expect(page.getByText(en.Finance.overview.analytics.activationNeeded)).toBeVisible();
  await page.locator("#main-content").getByTestId("finance-cash").getByRole("link", { name: /Overdue rent/ }).click();
  await expect(page).toHaveURL(/\/finance\/expected\?item=/);
  await page.goto("/finance?fx_USD=40");
  await page.getByRole("link", { name: t.fullForecast, exact: true }).first().click();
  await expect(page).toHaveURL(/fx_USD=40/);
  await page.getByRole("button", { name: f.comparison, exact: false }).click();
  await expect(page.getByRole("table", { name: f.comparison })).toContainText("100,390.00");
  await page.goto("/finance?fx_USD=40");
  await expect.poll(() => page.getByRole('group', { name: t.cashChart, exact: true }).evaluate(element => {
    const svg = element as SVGSVGElement;
    return Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width);
  })).toBeLessThan(1);
  await page.locator('circle[role="button"]').first().focus(); await page.keyboard.press("ArrowRight");
  await expect(page.locator('p[aria-live="polite"]')).not.toHaveText(t.chartInteraction);
  await page.setViewportSize({width:1920,height:1080});
  await page.screenshot({path:testInfo.outputPath("overview-desktop.png")});
  await page.setViewportSize({width:375,height:900}); await page.emulateMedia({colorScheme:"dark", reducedMotion:"reduce"});
  await page.context().addCookies([{name:"studioflow-locale",value:"uk",url:new URL(page.url()).origin}]); await page.reload();
  await expect(page.getByRole("heading", {name:uk.Finance.overview.title,exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("overview-mobile.png"),fullPage:true});
  expect(errors).toEqual([]);
});
test("employee cannot access Overview or Accounts", async ({ page }) => {
  await login(page, 1);
  for (const route of ["/finance", "/finance/accounts"]) { await page.goto(route); await expect(page).toHaveURL(/\/dashboard/); }
  const employee = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, z.string().min(1).parse(process.env.EQUIPMENT_TEST_PUBLISHABLE_KEY), { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await employee.auth.signInWithPassword(actors[1]);
  if (signedIn.error) throw signedIn.error;
  const denied = await employee.rpc("finalize_finance_setup", { p_studio_id: studio });
  expect(denied.error?.message).toContain("finance_admin_required");
});

test("large decimal amounts stay exact in cards, chart tables, drilldowns and stored valuations", async ({ page }) => {
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    select public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','1234567890.12','accountId','${foreign}','categoryId','${category}','fx',jsonb_build_object('rate','1000000.0000000006','source','manual','effectiveDate',(now() at time zone 'Europe/Kyiv')::date)));
    select public.record_finance_movement('${studio}',gen_random_uuid(),jsonb_build_object('kind','incoming','date',(now() at time zone 'Europe/Kyiv')::date,'amount','56.78','accountId','${bank}','categoryId','${category}'));`);
  await login(page); await page.goto("/finance?fx_USD=1000000");
  const cash = page.locator("#main-content").getByTestId("finance-cash").getByRole("link", { name: t.cash, exact: true }).locator("../..");
  await expect(cash).toContainText("1,234,567,900,160,554.78");
  await page.getByRole("button", { name: t.breakdown, exact: true }).click();
  const breakdown = page.locator("#overview-breakdown");
  await expect(breakdown).toContainText("1,234,567,900,120,000.00");
  await expect(cash).toContainText("1,234,567,900,160,554.78");
  await expect(page.getByRole("group", { name: t.cashChart })).toHaveCount(0);
  await expect(page.getByText(t.chartScale, { exact: true }).first()).toBeVisible();
  const chart = page.getByRole("table", { name: t.cashChart }); // Opens automatically when coordinates are unsafe.
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("1,234,567,890,160,945.52"); // Historical posted FX, not today's assumed FX.
  await expect(chart).toContainText("1,234,567,900,160,554.78");
  await page.getByRole("button", { name: t.netFlow, exact: true }).click();
  await expect(page.getByText(/1,234,567,890,159,945.52 UAH/)).toBeVisible(); // Net flow remains exact after owner distribution and transfer fee.
  await page.goto("/finance/movements");
  for (const detail of await page.locator("details").all()) await detail.evaluate(el => el.setAttribute("open", ""));
  await expect(page.getByText(/1,234,567,890,120,000\.74/)).toBeVisible();
  await page.goto("/finance/planning?fx_USD=1000000");
  await page.getByRole("button", { name: f.monthlyCash, exact: false }).click();
  await expect(page.getByRole("table", { name: f.cashProjection })).toContainText("1,234,567,900,220,434.78");
  await page.goto("/finance?fx_USD=1000000");
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: new URL(page.url()).origin }]); await page.reload();
  await expect(page.getByRole("link", { name: uk.Finance.overview.cash, exact: true }).locator("../..")).toContainText("1 234 567 900 160 554,78");
});


test("recognized analytics distinguish empty, populated and incomplete periods", async ({ page }, testInfo) => {
  const project = randomUUID(), incompleteProject = randomUUID();
  const day = "(now() at time zone 'Europe/Kyiv')::date";
  const month = "date_trunc('month',now() at time zone 'Europe/Kyiv')::date";
  const review = (projectId: string, revision: number, reviewed = true) => `select public.save_finance_report_coverage('${studio}',gen_random_uuid(),jsonb_build_object('projectId','${projectId}','month',${month},'through',${day},'revision',${revision},'revenue',${reviewed},'direct_costs',true,'labor',true,'overhead',true,'reason','Overview browser fixture'));`;
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    select public.activate_finance_recognition('${studio}',gen_random_uuid(),${month});
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status,country_code) values
      ('${project}','${studio}','Reviewed project',100,${month},'${actors[0].id}','active','UA'),
      ('${incompleteProject}','${studio}','Project awaiting data',100,${month},'${actors[0].id}','active','UA');
    ${review('',0)}${review(project,0)}`);
  await login(page); await page.goto('/finance?period=month&fx_USD=40');
  const analytics = page.locator("#main-content").getByTestId('finance-analytics');
  async function captureState(state: string) {
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.locator('svg[role="group"]').evaluateAll(elements => elements.every(element => {
        const svg = element as SVGSVGElement;
        return Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width) < 1;
      }))).toBe(true);
      // Capture the settled disclosure height and viewport-dependent layout.
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const main = page.locator('#main-content');
      await main.evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: testInfo.outputPath(`${state}-${width}.png`), fullPage: true, animations: 'disabled' });
      if (await main.evaluate(element => element.scrollHeight > element.clientHeight)) {
        await main.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await page.screenshot({ path: testInfo.outputPath(`${state}-${width}-lower.png`), fullPage: true, animations: 'disabled' });
        await main.evaluate(element => { element.scrollTop = 0; });
      }
    }
  }
  await expect(analytics).toContainText(en.Finance.overview.analytics.emptyPerformance);
  await expect(analytics.getByRole('region', { name: en.Finance.overview.analytics.headline, exact: true })).toContainText('0.00');
  await expect(analytics).toContainText('Project awaiting data');
  await captureState('empty');
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);
    select public.record_finance_recognition('${studio}',gen_random_uuid(),jsonb_build_object('sourceKind','expected','sourceId',(select id from public.finance_expected_items where studio_id='${studio}' and description='Contract receipt'),'classification','revenue','amount','40000','date',${day},'periodStart',${month},'periodEnd',${day},'description','Overview recognized income','reason','Browser fixture'));
    ${review('',1)}`);
  await page.reload();
  await expect(analytics.getByRole('region', { name: en.Finance.overview.analytics.headline, exact: true })).toContainText('40,000.00');
  await expect(analytics.getByRole('group', { name: en.Finance.overview.analytics.trend })).toBeVisible();
  await analytics.getByRole('button', { name: en.Finance.overview.analytics.lowest, exact: true }).click();
  await expect(analytics.getByRole('button', { name: en.Finance.overview.analytics.lowest, exact: true })).toHaveAttribute('aria-pressed','true');
  await analytics.locator('rect[role="button"]').first().focus();
  await expect(analytics.locator('[aria-live="polite"]')).toContainText('40,000.00');
  await analytics.getByRole('button', { name: en.Finance.overview.analytics.chartData, exact: true }).click();
  await expect(analytics.getByRole('table')).toContainText('40,000.00');
  await captureState('populated');
  await page.getByRole('link', { name: t.periods['3'], exact: true }).click();
  await expect(analytics.getByRole('region', { name: en.Finance.overview.analytics.headline, exact: true })).toContainText('40,000.00');
  await expect(analytics).toContainText(en.Finance.overview.analytics.partial);
  await expect(analytics.locator('rect[role="button"]')).toHaveCount(3);
  await captureState('default-period');
  await page.getByRole('link', { name: t.periods.month, exact: true }).click();
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);${review('',2,false)}${review(project,1,false)}`);
  await page.reload();
  await expect(analytics).toContainText(en.Finance.overview.analytics.partial);
  await expect(analytics.getByRole('button', { name: en.Finance.overview.analytics.highest, exact: true })).toHaveCount(0);
  await expect(analytics).toContainText(en.Finance.overview.analytics.emptyRanking);
  await captureState('incomplete');
  for (const text of ['Confirm source amounts','Review period coverage','Recognition history']) await expect(analytics.getByText(text, { exact: true })).toHaveCount(0);
});
