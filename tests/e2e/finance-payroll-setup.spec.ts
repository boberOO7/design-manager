import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import en from "../../messages/en.json";
import type { Database } from "../../src/types/database.types";

const local=z.object({EQUIPMENT_TEST_SUPABASE_URL:z.url(),EQUIPMENT_TEST_SERVICE_KEY:z.string()}).parse(process.env);
if(!["127.0.0.1","localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local Finance fixtures only");
const client=createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL,local.EQUIPMENT_TEST_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const studio=randomUUID(),bank=randomUUID();
const actors=["admin","employee","employee","employee","employee"].map((role,index)=>({role,name:["Payroll admin","Payroll employee","Payroll designer","Payroll architect","Payroll assistant"][index],id:"",email:`payroll-${randomUUID()}@example.test`,password:`Finance-${randomUUID()}`}));
function sql(statement:string){return execFileSync("docker",["exec","-i","supabase_db_design-manager","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At"],{input:statement,encoding:"utf8"}).trim();}
const t=en.Finance,s=t.schedules;
async function login(page:Page,index=0){await page.goto("/login");await page.locator('input[type="email"]').fill(actors[index].email);await page.locator('input[type="password"]').fill(actors[index].password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);}

test.beforeAll(async()=>{
  await client.from("studios").insert({id:studio,name:"Payroll browser test"}).throwOnError();
  for(const actor of actors){
    const {data,error}=await client.auth.admin.createUser({email:actor.email,password:actor.password,email_confirm:true});if(error)throw error;actor.id=data.user.id;
    await client.from("profiles").upsert({id:actor.id,email:actor.email,full_name:actor.name,system_role:actor.role,is_active:true}).throwOnError();
    await client.from("studio_members").insert({studio_id:studio,user_id:actor.id,system_role:actor.role,joined_at:"2026-01-15"}).throwOnError();
  }
  sql(`insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','UAH','2026-01-01','${actors[0].id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bank}','${studio}','Payroll bank','UAH',10000,'${actors[0].id}');
    select set_config('request.jwt.claim.sub','${actors[0].id}',false);select public.finalize_finance_setup('${studio}');`);
});
test.afterAll(async()=>{
  // Local fixture-only cleanup; preserve production's immutable financial history.
  sql(`begin;set local session_replication_role=replica;
    delete from public.finance_payroll_cost_revisions where studio_id='${studio}';delete from public.finance_obligation_items where studio_id='${studio}';delete from public.finance_obligations where studio_id='${studio}';
    delete from public.finance_schedule_terms where studio_id='${studio}';delete from public.finance_schedules where studio_id='${studio}';
    delete from public.finance_allocations where studio_id='${studio}';delete from public.finance_expected_items where studio_id='${studio}';
    delete from public.finance_planning_requests where studio_id='${studio}';delete from public.finance_movement_entries where studio_id='${studio}';
    delete from public.finance_movements where studio_id='${studio}';delete from public.finance_accounts where studio_id='${studio}';
    delete from public.finance_recurring_groups where studio_id='${studio}';delete from public.finance_categories where studio_id='${studio}';delete from public.finance_settings where studio_id='${studio}';
    delete from public.notifications where studio_id='${studio}';delete from public.studio_members where studio_id='${studio}';delete from public.studios where id='${studio}';commit;`);
  for(const actor of actors)if(actor.id){const {error}=await client.auth.admin.deleteUser(actor.id);if(error)throw error;}
});

test("team setup resumes partial saves and groups preserve financial history", async ({ page }, testInfo) => {
  await login(page); await page.goto("/finance/schedules");
  await page.getByRole("button", { name: s.addCompensation, exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: s.employee, exact: true }).click();
  await page.getByRole("option", { name: "Payroll admin", exact: true }).click();
  await dialog.getByLabel(s.agreedAmount, { exact: true }).fill("60000");
  await dialog.getByRole("button", { name: t.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  const existing = sql(`select to_jsonb(t)::text from finance_schedule_terms t join finance_schedules s on s.id=t.schedule_id where s.studio_id='${studio}' and s.employee_id='${actors[0].id}'`);
  await page.getByRole("button", { name: s.setupTeam, exact: true }).click(); dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("group", { name: "Payroll admin", exact: true })).toHaveCount(0);
  const employee = dialog.getByRole("group", { name: "Payroll employee", exact: true });
  const designer = dialog.getByRole("group", { name: "Payroll designer", exact: true });
  await expect(employee.getByLabel(s.effectiveFrom, { exact: true })).toHaveValue("2026-01");
  await employee.getByLabel(s.agreedAmount, { exact: true }).fill("50000");
  await designer.getByLabel(s.agreedAmount, { exact: true }).fill("45000.123");
  await designer.getByRole("button", { name: s.setupOverrides, exact: true }).click();
  await designer.getByLabel(s.setupCustomDefaults, { exact: true }).check();
  await designer.getByRole("switch").click();
  await designer.getByLabel(s.deductions, { exact: true }).fill("5000");
  await designer.getByLabel(s.payout, { exact: true }).fill("40000");
  await designer.getByLabel(s.employerCost, { exact: true }).fill("0");
  await dialog.getByRole("button", { name: s.setupSave, exact: true }).click();
  await expect(employee.getByRole("status")).toHaveText(s.setupSaved);
  await expect(designer.getByRole("status")).toHaveText(s.errors.amount);
  await expect(employee.getByLabel(s.agreedAmount, { exact: true })).toBeDisabled();
  await designer.getByLabel(s.agreedAmount, { exact: true }).fill("45000");
  await dialog.getByRole("button", { name: s.setupSave, exact: true }).click();
  await expect(designer.getByRole("status")).toHaveText(s.setupSaved);
  await dialog.getByRole("button", { name: t.movements.close, exact: true }).first().click();
  expect(sql(`select to_jsonb(t)::text from finance_schedule_terms t join finance_schedules s on s.id=t.schedule_id where s.studio_id='${studio}' and s.employee_id='${actors[0].id}'`)).toBe(existing);
  expect(sql(`select count(*) from finance_schedule_terms where studio_id='${studio}'`)).toBe("3");
  expect(sql(`select employee_deductions is null and employer_cost is null from finance_schedule_terms t join finance_schedules s on s.id=t.schedule_id where s.employee_id='${actors[1].id}' and s.studio_id='${studio}'`)).toBe("t");
  expect(sql(`select basis||'|'||employee_payout||'|'||employee_deductions||'|'||employer_cost from finance_schedule_terms t join finance_schedules s on s.id=t.schedule_id where s.employee_id='${actors[2].id}' and s.studio_id='${studio}'`)).toBe("gross|40000|5000|0");
  for (const name of ["Office", "Software"]) {
    await page.getByRole("button", { name: s.addGroup, exact: true }).click(); dialog = page.getByRole("dialog");
    await dialog.getByLabel(s.groupName, { exact: true }).fill(name);
    await dialog.getByRole("button", { name: t.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  }
  for (const [name, category] of [["Office rent", t.planning.defaults.rent], ["Utilities", t.planning.defaults.utilities]]) {
    await page.getByRole("button", { name: s.addInGroup.replace("{name}", "Office"), exact: true }).click(); dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox", { name: s.group, exact: true })).toHaveText("Office");
    await dialog.getByLabel(s.name, { exact: true }).fill(name);
    await dialog.getByLabel(t.movements.amount, { exact: true }).fill("15000");
    await dialog.getByRole("combobox", { name: t.movements.category, exact: true }).click(); await page.getByRole("option", { name: category, exact: true }).click();
    await dialog.getByRole("button", { name: t.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  }
  const snapshot = () => sql(`select jsonb_agg(to_jsonb(t) order by id)::text from finance_schedule_terms t where studio_id='${studio}'`);
  const beforeMove = snapshot();
  const utilities = page.locator("article").filter({ has: page.getByRole("heading", { name: "Utilities", exact: true }) });
  await utilities.getByRole("button", { name: s.moveGroup, exact: true }).click(); dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: s.group, exact: true }).click(); await page.getByRole("option", { name: "Software", exact: true }).click();
  await dialog.getByRole("button", { name: t.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Software", exact: true }).getByRole("heading", { name: "Utilities", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Software", exact: true }).getByRole("button", { name: s.groupUp, exact: true }).click();
  await expect.poll(() => sql(`select name from finance_recurring_groups where studio_id='${studio}' order by position limit 1`)).toBe("Software");
  await page.getByRole("region", { name: "Software", exact: true }).getByRole("button", { name: s.renameGroup, exact: true }).click(); dialog = page.getByRole("dialog");
  await dialog.getByLabel(s.groupName, { exact: true }).fill("Subscriptions");
  await dialog.getByRole("button", { name: t.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(snapshot()).toBe(beforeMove);
  await page.reload(); await expect(page.getByRole("region", { name: "Subscriptions", exact: true })).toBeVisible();
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("grouped-team.png"), fullPage: true });
});

test("recurring selection, mouse and keyboard focus, motion, and bulk organization", async ({ page }, testInfo) => {
  const groupA = randomUUID(), groupB = randomUUID();
  const categoryId = sql(`select id from finance_categories where studio_id='${studio}' and default_key='rent'`);
  sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select manage_finance_recurring_group('${studio}','create','${groupA}','Selection A');select manage_finance_recurring_group('${studio}','create','${groupB}','Selection B');`);
  for (const [name, groupId] of [["Select rent", groupA], ["Select utilities", groupB], ["Select cleaning", groupA]]) {
    const input = { kind: "recurring", name, groupId, categoryId, amount: "1000", currency: "UAH", intervalMonths: 1, payoutDay: 10, paymentMonthOffset: 0, effectiveFrom: "2026-09-01", commitment: "agreed", certainty: "fixed", employerCostStatus: "unknown", reason: "Interaction fixture", revision: 0 };
    sql(`select set_config('request.jwt.claim.sub','${actors[0].id}',false);select save_finance_recurring_schedule('${studio}','${randomUUID()}','${JSON.stringify(input)}'::jsonb);`);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await login(page); await page.goto("/finance/schedules");
  const row = (name: string) => page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
  const rent = row("Select rent"), utilities = row("Select utilities"), cleaning = row("Select cleaning");
  const history = rent.getByRole("button", { name: s.history, exact: true });
  const actions = history.locator("..");
  await rent.hover(); await expect(actions).toHaveCSS("opacity", "1");
  await history.click(); await page.mouse.move(5, 5);
  await expect(history).toBeFocused(); await expect(actions).toHaveCSS("opacity", "0");
  const detailsId = await history.getAttribute("aria-controls");
  const details = page.locator(`[id="${detailsId}"]`);
  await expect(details).toHaveAttribute("aria-hidden", "false");
  await expect(details).toHaveCSS("transition-duration", "0.22s");
  await page.keyboard.press("Tab"); await history.focus();
  expect(await history.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
  await expect(actions).toHaveCSS("opacity", "1");
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("keyboard-details.png") });
  await page.keyboard.press("Enter"); await expect(details).toHaveAttribute("inert", "");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.dataset.motion = "system"; });
  const frames = await history.evaluate(async (button) => {
    const target = document.getElementById(button.getAttribute("aria-controls") ?? "");
    if (!target || !(button instanceof HTMLElement)) throw new Error("Missing details");
    const samples: number[] = [], start = performance.now();
    button.click();
    await new Promise<void>((resolve) => {
      const sample = () => { samples.push(target.getBoundingClientRect().height); if (performance.now() - start < 350) requestAnimationFrame(sample); else resolve(); };
      requestAnimationFrame(sample);
    });
    return samples;
  });
  const fullHeight = frames.at(-1) ?? 0;
  expect(fullHeight).toBeGreaterThan(20);
  expect(frames.filter((height) => height > 2 && height < fullHeight - 2).length).toBeGreaterThanOrEqual(3);
  await history.click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => { document.documentElement.dataset.motion = "off"; });
  await expect(details).toHaveCSS("transition-duration", "1e-05s");
  await page.evaluate(() => { document.documentElement.dataset.motion = "system"; });
  await rent.getByRole("checkbox").check();
  await utilities.getByRole("heading").click({ modifiers: ["Control"] });
  await cleaning.getByRole("heading").click({ modifiers: ["Meta"] });
  await expect(page.getByRole("status")).toHaveText("Selected 3");
  await cleaning.getByRole("heading").click({ modifiers: ["Meta"] });
  await expect(page.getByRole("status")).toHaveText("Selected 2");
  await page.mouse.move(5, 5);
  await expect(cleaning.getByRole("checkbox").locator("..")).toHaveCSS("opacity", "1");
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("multi-selection.png"), fullPage: true });
  const snapshot = () => sql(`select jsonb_build_object('terms',(select jsonb_agg(to_jsonb(t) order by id) from finance_schedule_terms t where studio_id='${studio}'),'items',(select jsonb_agg(to_jsonb(i) order by id) from finance_expected_items i where studio_id='${studio}'),'ledger',(select jsonb_agg(to_jsonb(m) order by id) from finance_movements m where studio_id='${studio}'))::text`);
  const beforeMove = snapshot();
  await page.getByRole("button", { name: s.moveSelected, exact: true }).filter({ hasText: s.moveSelected }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: s.group, exact: true }).click();
  await page.getByRole("option", { name: "Selection B", exact: true }).click();
  await dialog.getByRole("button", { name: t.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Selection B", exact: true }).getByRole("heading", { name: "Select rent", exact: true })).toBeVisible();
  expect(snapshot()).toBe(beforeMove);
  await rent.getByRole("checkbox").check(); await utilities.getByRole("checkbox").check();
  await page.getByRole("button", { name: s.moveSelected, exact: true }).filter({ hasText: s.moveSelected }).click(); dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: s.group, exact: true })).toHaveText(s.ungrouped);
  await dialog.getByRole("button", { name: t.planning.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: s.ungrouped, exact: true }).getByRole("heading", { name: "Select rent", exact: true })).toBeVisible();
  expect(snapshot()).toBe(beforeMove);
  await rent.getByRole("checkbox").check(); await page.getByRole("button", { name: s.clearSelection, exact: true }).click(); await expect(rent.getByRole("checkbox")).not.toBeChecked();
  await page.setViewportSize({ width: 375, height: 900 }); await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS("opacity", "1");
  await expect(rent.getByRole("checkbox").locator("..")).toHaveCSS("opacity", "1");
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("mobile-actions.png"), fullPage: true });
});
