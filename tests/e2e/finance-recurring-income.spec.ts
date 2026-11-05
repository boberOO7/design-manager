import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import uk from "../../messages/uk.json";
import { signInLocalTestUser } from "../helpers/auth";

const env = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(env.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local recurring income fixtures only");
const service = createClient<Database>(env.EQUIPMENT_TEST_SUPABASE_URL, env.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false } });
const studioId = randomUUID(), bankId = randomUUID();
const actor = { id: "", email: `income-${randomUUID()}@example.test`, password: `Income-${randomUUID()}` };
function sql(input: string) {
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-Atq"], {
    input, encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres", PGCONNECT_TIMEOUT: "3" },
  }).trim();
}

test.beforeAll(async () => {
  const user = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (user.error) throw user.error;
  actor.id = user.data.user.id;
  await service.from("studios").insert({ id: studioId, name: "Recurring income browser fixture" }).throwOnError();
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Income admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studioId, user_id: actor.id, system_role: "admin" }).throwOnError();
  sql(`begin;
    insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studioId}','UAH',date_trunc('month',now() at time zone 'Europe/Kyiv')::date,'${actor.id}');
    insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by) values('${studioId}','A different bank','UAH',0,'${actor.id}');
    insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${bankId}','${studioId}','Income bank','UAH',0,'${actor.id}');
    select set_config('request.jwt.claim.sub','${actor.id}',true);
    select public.finalize_finance_setup('${studioId}');
    commit;`);
});

test.afterAll(async () => {
  // Isolated local tenant only; do not relax immutable production history.
  sql(`begin;set local session_replication_role=replica;
    do $$declare item record;begin
      for item in select table_schema,table_name from information_schema.columns where column_name='studio_id' and table_schema in ('public','private')
        and table_name in(select tablename from pg_tables where schemaname in ('public','private')) loop
        execute format('delete from %I.%I where studio_id=$1',item.table_schema,item.table_name) using '${studioId}'::uuid;
      end loop;
    end$$;
    delete from public.studios where id='${studioId}';commit;`);
  if (actor.id) { const deleted = await service.auth.admin.deleteUser(actor.id); if (deleted.error) throw deleted.error; }
});

test("create recurring income and confirm receipt through the existing expected-payment flow", async ({ page }) => {
  const f = uk.Finance, name = "Дохід від іншої діяльності";
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL! }]);
  await signInLocalTestUser(page, actor);
  await page.goto("/finance/schedules");
  await page.getByRole("button", { name: f.schedules.addRecurring, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("switch", { name: `${f.movements.type}: ${f.movements.kinds.outgoing}`, exact: true }).click();
  await dialog.locator("input[name=name]").fill(name);
  await dialog.locator("input[name=amount]").fill("250.50");
  await dialog.getByRole("combobox", { name: f.movements.category, exact: true }).click();
  await page.getByRole("option", { name: f.planning.defaults.other_income, exact: true }).click();
  await dialog.getByRole("combobox", { name: f.movements.account, exact: true }).click();
  await page.getByRole("option", { name: "Income bank · UAH", exact: true }).click();
  await expect(dialog.locator("[name=servicePolicy]")).toHaveCount(0);
  await dialog.getByRole("button", { name: f.planning.save, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(row.getByText(f.movements.kinds.incoming, { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: f.schedules.pause, exact: true })).toBeAttached();
  expect(sql(`select recorded_balance from finance_account_balances where id='${bankId}'`)).toBe("0");
  const itemId = sql(`select l.expected_item_id from finance_obligations o join finance_obligation_items l on l.studio_id=o.studio_id and l.obligation_id=o.id
    where o.studio_id='${studioId}' and o.period_start=date_trunc('month',now() at time zone 'Europe/Kyiv')::date`);
  expect(z.uuid().safeParse(itemId).success).toBe(true);
  await page.goto(`/finance/expected?item=${itemId}&period=all`);
  const expected = page.locator("article").filter({ hasText: name }).first();
  const payment = page.getByRole("dialog");
  // Opening is safe to retry while the freshly loaded development page hydrates.
  await expect(async () => {
    await expected.getByRole("button", { name: f.planning.recordPayment, exact: true }).click();
    await expect(payment).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(payment.getByRole("combobox", { name: f.movements.account, exact: true })).toHaveText("Income bank · UAH");
  await payment.getByRole("button", { name: f.planning.recordPayment, exact: true }).click();
  await expect(payment).toHaveCount(0);
  expect(sql(`select recorded_balance=250.50 from finance_account_balances where id='${bankId}'`)).toBe("t");
  expect(sql(`select remaining_amount from finance_expected_balances where id='${itemId}'`)).toMatch(/^0(?:\.0+)?$/);
  expect(sql(`select count(*) from finance_movements where studio_id='${studioId}' and kind='incoming'`)).toBe("1");
  expect(errors).toEqual([]);
});
