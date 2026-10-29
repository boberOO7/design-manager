import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import uk from "../../messages/uk.json";
import { signInLocalTestUser } from "../helpers/auth";

const local = z.object({ EQUIPMENT_TEST_SUPABASE_URL: z.url(), EQUIPMENT_TEST_SERVICE_KEY: z.string(), EQUIPMENT_TEST_PUBLISHABLE_KEY: z.string() }).parse(process.env);
if (!["localhost", "127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname)) throw new Error("Directions fixtures require local Supabase");
const service = createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL, local.EQUIPMENT_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const studio = randomUUID(), template = randomUUID(), interiorTemplate = randomUUID();
const actor = { id: "", email: `directions-${randomUUID()}@example.test`, password: `Directions-${randomUUID()}` };
const sql = (statement: string) => execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1"], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

test.beforeAll(async () => {
  await service.from("studios").insert({ id: studio, name: "Project creation browser fixture" }).throwOnError();
  const user = await service.auth.admin.createUser({ email: actor.email, password: actor.password, email_confirm: true });
  if (user.error) throw user.error;
  actor.id = user.data.user.id;
  await service.from("profiles").upsert({ id: actor.id, email: actor.email, full_name: "Creation admin", system_role: "admin", is_active: true }).throwOnError();
  await service.from("studio_members").insert({ studio_id: studio, user_id: actor.id, system_role: "admin" }).throwOnError();
  sql(`select set_config('request.jwt.claim.sub','${actor.id}',false);
    insert into public.project_templates(id,studio_id,project_type,name,is_active,is_default,created_by) values
      ('${interiorTemplate}','${studio}','private','Interior starter',true,false,'${actor.id}'),
      ('${template}','${studio}','private','Facade starter',true,false,'${actor.id}');
    insert into public.project_template_tasks(template_id,stage,title,priority,position) values
      ('${interiorTemplate}','stage_1','Interior concept','normal',0),
      ('${interiorTemplate}','stage_2','Interior visualization','normal',0),
      ('${interiorTemplate}','stage_3','Interior drawings','normal',0),
      ('${interiorTemplate}','stage_4','Interior support','normal',0),
      ('${template}','stage_1','Facade concept','normal',0),
      ('${template}','stage_3','Facade drawings','normal',0),
      ('${template}','stage_4','Facade support','normal',0);
    select public.save_studio_direction_preset('${studio}','{"kind":"interior","coefficient":1,"recommendedMin":0.8,"recommendedMax":1.2,"templateId":"${interiorTemplate}","version":1}');
    select public.save_studio_direction_preset('${studio}','{"kind":"facade","coefficient":0.35,"recommendedMin":0.2,"recommendedMax":0.8,"templateId":"${template}","version":1}');`);
});

test.afterAll(async () => {
  // Remove only this isolated studio's fixtures, including immutable task history.
  sql(`begin; set local session_replication_role=replica;
    delete from public.project_template_tasks where template_id in('${template}','${interiorTemplate}');
    delete from public.task_checklist_items where task_id in(select t.id from public.tasks t join public.projects p on p.id=t.project_id where p.studio_id='${studio}');
    do $$ declare r record; begin
      for r in select distinct table_schema,table_name from information_schema.columns c join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='project_id' and p.relkind='r' loop
        execute format('delete from %I.%I where project_id in(select id from public.projects where studio_id=%L)',r.table_schema,r.table_name,'${studio}');
      end loop;
      for r in select distinct table_schema,table_name from information_schema.columns c join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
        where c.table_schema in ('public','private') and c.column_name='studio_id' and p.relkind='r' loop
        execute format('delete from %I.%I where studio_id=%L',r.table_schema,r.table_name,'${studio}');
      end loop;
    end $$;
    delete from public.studios where id='${studio}'; commit;`);
  if (actor.id) await service.auth.admin.deleteUser(actor.id);
});

test("creates one or multiple directions with templates and preserves navigation", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const f = uk.ProjectForm, d = uk.ProjectWorkspace.directions, w = uk.ProjectWorkspace;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /MISSING_MESSAGE|Encountered two children/.test(message.text())) errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem("studioflow-theme", "dark"));
  await page.context().addCookies([{ name: "studioflow-locale", value: "uk", url: String(testInfo.project.use.baseURL) }]);
  await signInLocalTestUser(page, actor);
  for (const multiple of [false, true]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/projects");
    await page.getByRole("button", { name: uk.Projects.newProject, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: uk.Projects.newProject, exact: true });
    await dialog.locator('[name="project_name"]').fill(multiple ? "Будинок · Інтер’єр і Фасад" : "Квартира · Інтер’єр");
    await dialog.locator('[name="total_area_m2"]').fill("120");
    const interior = dialog.locator('[data-creation-direction="interior"]');
    await expect(interior).toContainText(d.kinds.interior);
    await expect(interior.getByRole("combobox", { name: d.template })).toContainText("Interior starter");
    const description = dialog.locator('[name="description"]');
    await description.fill("Сучасний житловий простір.\nДенна зона з природним світлом.\nОкрема робоча зона.");
    expect(await description.evaluate(node => node.scrollHeight <= node.clientHeight + 2)).toBe(true);
    if (multiple) {
      await dialog.getByRole("combobox", { name: d.addShort }).click();
      await page.getByRole("option", { name: d.kinds.facade, exact: true }).click();
      const facade = dialog.locator("section[data-creation-direction]");
      await expect(facade.getByRole("combobox", { name: d.template })).toContainText("Facade starter");
      await dialog.getByRole("button", { name: f.create, exact: true }).click();
      await expect(facade.getByRole("spinbutton", { name: d.area, exact: true })).toBeFocused();
      await facade.getByRole("spinbutton", { name: d.area, exact: true }).fill("200");
      await expect(facade.getByRole("spinbutton", { name: d.coefficient, exact: true })).toHaveValue("0.35");
      await facade.getByRole("button", { name: f.increaseCoefficient }).click();
      const coefficient = facade.getByRole("spinbutton", { name: d.coefficient, exact: true });
      await expect(coefficient).toHaveValue("0.4");
      await coefficient.focus();
      await page.keyboard.press("ArrowUp");
      await expect(coefficient).toHaveValue("0.41");
      await page.keyboard.press("ArrowDown");
      await facade.getByRole("button", { name: f.decreaseCoefficient }).click();
      await expect(coefficient).toHaveValue("0.35");
      await expect(facade).toContainText("70");
      await expect(facade).toContainText("Етапи: 2 основні · 1 додатковий");
    }
    await page.screenshot({ path: `/tmp/studioflow-project-create-${multiple ? "multi" : "single"}-desktop.png`, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await interior.scrollIntoViewIfNeeded();
    if (multiple) {
      const facade = dialog.locator("section[data-creation-direction]");
      const coefficient = facade.getByRole("spinbutton", { name: d.coefficient, exact: true });
      await coefficient.scrollIntoViewIfNeeded();
      await facade.getByRole("button", { name: f.increaseCoefficient }).click();
      await expect(coefficient).toHaveValue("0.4");
      await facade.getByRole("button", { name: f.decreaseCoefficient }).click();
      await expect(coefficient).toHaveValue("0.35");
      expect(await coefficient.evaluate(node => node.getBoundingClientRect().bottom <= (node.closest("form")?.firstElementChild?.getBoundingClientRect().bottom ?? 0))).toBe(true);
    }

    await page.screenshot({ path: `/tmp/studioflow-project-create-${multiple ? "multi" : "single"}-mobile.png`, animations: "disabled" });
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: `/tmp/studioflow-project-create-${multiple ? "multi" : "single"}-notebook.png`, animations: "disabled" });
    await dialog.getByRole("button", { name: f.create, exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[a-f0-9-]{36}/);
    const project = z.uuid().parse(new URL(page.url()).pathname.split("/").at(-1));
    expect(sql(`select count(*) from public.project_work_directions where project_id='${project}';`)).toBe(multiple ? "2" : "1");
    expect(sql(`select count(*) from public.tasks where project_id='${project}';`)).toBe(multiple ? "7" : "4");
    expect(sql(`select client_name is null and total_area_m2=120 from public.projects where id='${project}';`)).toBe("t");
    if (multiple) expect(sql(`select count(*) from public.project_task_stage_columns s join public.project_work_directions d on d.id=s.direction_id where d.project_id='${project}' and d.kind='facade';`)).toBe("3");
    const nav = page.getByRole("navigation", { name: w.projectNavigation, exact: true });
    for (const [label, view] of [[w.team, "team"], [w.activity, "activity"], [w.feedback, "feedback"]]) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`view=${view}`));
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const label of [w.team, w.activity, w.feedback]) await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    expect(await nav.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/studioflow-project-navigation-${multiple ? "multi" : "single"}-mobile.png`, animations: "disabled" });
    const initialDirection = sql(`select id from public.project_work_directions where project_id='${project}' and is_default;`);
    await page.goto(`/projects/${project}?workDirection=${initialDirection}`);
    const header = page.locator('section[aria-labelledby="project-context-heading"]');
    await header.getByRole("button", { name: w.moreActions, exact: true }).click();
    await expect(page.getByRole("button", { name: uk.StageConfiguration.configure, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await header.getByRole("button", { name: d.actions.replace("{name}", d.kinds.interior), exact: true }).click();
    await expect(page.getByRole("button", { name: d.moveDown, exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    if (multiple) {
      await header.getByRole("link", { name: d.projectOverview, exact: true }).click();
      await expect(header.locator("[data-work-directions]")).toHaveAttribute("data-focused", "false");
      await header.getByRole("button", { name: d.actions.replace("{name}", d.kinds.interior), exact: true }).click();
      await page.getByRole("button", { name: d.moveDown, exact: true }).click();
      await expect.poll(() => sql(`select kind from public.project_work_directions where project_id='${project}' order by display_order limit 1;`)).toBe("facade");
    }
  }
  expect(errors).toEqual([]);
});
