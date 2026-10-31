import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import { signInLocalTestUser } from "../helpers/auth";
import uk from "../../messages/uk.json";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Local fixtures only");
const service = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studio = randomUUID(), project = randomUUID();
const actor = { id: "", email: `stage-methods-${randomUUID()}@example.test`, password: `Methods-${randomUUID()}` };
const sql = (statement: string) => execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1"], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studio, name: "Stage methods browser" }).throwOnError();
  const user = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (user.error) throw user.error;
  actor.id = user.data.user.id;
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Methods admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: "admin" }).throwOnError();
  sql(`select set_config('request.jwt.claim.sub','${actor.id}',false);
    insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
    values('${project}','${studio}','Stage methods',120,current_date,'${actor.id}','active');
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
    values('${project}','${actor.id}','designer',0,current_date);`);
});

test.afterAll(async () => {
  // Scope cleanup to this fixture, including immutable membership history.
  sql(`begin; set local session_replication_role=replica;
    do $$ declare r record; begin
      for r in select distinct c.table_schema,c.table_name from information_schema.columns c
        join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='project_id' and p.relkind='r' loop
        execute format('delete from %I.%I where project_id=%L',r.table_schema,r.table_name,'${project}');
      end loop;
      for r in select distinct c.table_schema,c.table_name from information_schema.columns c
        join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='studio_id' and p.relkind='r' loop
        execute format('delete from %I.%I where studio_id=%L',r.table_schema,r.table_name,'${studio}');
      end loop;
    end $$;
    delete from public.projects where id='${project}'; delete from public.studios where id='${studio}'; commit;`);
  if (actor.id) await service.auth.admin.deleteUser(actor.id);
});

test("stage methods persist, support keyboard selection and keep the saved choice on failure", async ({ page }) => {
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: test.info().project.use.baseURL ?? "http://127.0.0.1:3000" }]);
  await signInLocalTestUser(page, actor);
  await page.goto(`/projects/${project}`);
  const trigger = page.getByRole("button", { name: "Налаштувати стовпці", exact: true }).nth(1);
  await trigger.click();
  const menu = page.getByRole("dialog").filter({ has: page.getByRole("radio", { name: "За площею", exact: true }) });
  await expect(menu.getByRole("radio")).toHaveCount(3);
  await expect(menu.getByRole("radio", { name: "За площею", exact: true })).toBeChecked();
  await expect(menu.getByText(uk.Tasks.stageProgressMethods.area.description, { exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: uk.StageTaskEditor.title, exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Налаштувати стовпці", exact: true })).toBeVisible();
  const persist = page.waitForResponse(response => response.url().endsWith("/stages/stage_2/columns") && response.request().method() === "PATCH");
  await menu.getByRole("radio", { name: "Зважений", exact: true }).click();
  expect((await persist).ok()).toBe(true);
  await expect(menu.getByRole("radio", { name: "Зважений", exact: true })).toBeChecked();
  expect(sql(`select progress_method from public.project_task_stage_columns where project_id='${project}' and stage='stage_2'`)).toBe("weighted");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.reload();
  await trigger.click();
  await expect(menu.getByRole("radio", { name: "Зважений", exact: true })).toBeChecked();
  await menu.getByRole("radio", { name: "Зважений", exact: true }).focus();
  const keyboardSave = page.waitForResponse(response => response.url().endsWith("/stages/stage_2/columns") && response.request().method() === "PATCH");
  await page.keyboard.press("ArrowUp");
  expect((await keyboardSave).ok()).toBe(true);
  await expect(menu.getByRole("radio", { name: "За площею", exact: true })).toBeChecked();
  await expect(menu.getByRole("radio", { name: "За площею", exact: true })).toBeFocused();
  await page.route("**/stages/stage_2/columns", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, formError: "Test save failure" }) }));
  await menu.getByRole("radio", { name: "Рівний", exact: true }).click();
  await expect(menu.getByRole("radio", { name: "За площею", exact: true })).toBeChecked();
  await expect(page.getByRole("alert").filter({ has: page.locator("p") })).toBeVisible();
  await page.unroute("**/stages/stage_2/columns");
  await page.screenshot({ path: "/tmp/studioflow-stage-progress-menu.png" });
});
