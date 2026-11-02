import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";
import { metaMutationSchema, type MetaPreview } from "../../src/lib/meta-leads/contracts";
import { signInLocalTestUser } from "../helpers/auth";

const local=z.object({EQUIPMENT_TEST_SUPABASE_URL:z.url(),EQUIPMENT_TEST_SERVICE_KEY:z.string()}).parse(process.env);
if (!["localhost","127.0.0.1"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname))throw new Error("Meta fixtures must be local");
const service=createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL,local.EQUIPMENT_TEST_SERVICE_KEY,{auth:{persistSession:false}});
const studioId=z.uuid().parse(process.env.META_TEST_STUDIO_ID ?? "54000000-0000-4000-8000-000000000001");
const account={id:"",email:`meta-ui-${randomUUID()}@example.test`,password:`Meta-${randomUUID()}`};
const id=(value:string)=>"'"+z.uuid().parse(value)+"'";
function fixtureSql(input:string) {return execFileSync("docker",["exec","-i","supabase_db_design-manager","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At"],{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();}
test.beforeAll(async()=>{
  await service.from("studios").insert({id:studioId,name:"Meta UI fixture"}).throwOnError();
  const {data,error}=await service.auth.admin.createUser({email:account.email,password:account.password,email_confirm:true});
  if (error)throw error;account.id=data.user.id;
  await service.from("profiles").upsert({id:account.id,full_name:"Meta fixture admin",email:account.email,system_role:"admin",is_active:true}).throwOnError();
  await service.from("studio_members").insert({studio_id:studioId,user_id:account.id,system_role:"admin"}).throwOnError();
  fixtureSql(`insert into public.crm_leads(studio_id,client_name,phone,first_contact_date) values(${id(studioId)},'Manual UI fixture','+48503448352','2026-11-01');`);
});
test.afterAll(async()=>{
  execFileSync("docker",["exec","-i","supabase_db_design-manager","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At"],{
    input:`begin; delete from public.crm_leads where studio_id=${id(studioId)}; set local session_replication_role=replica; delete from private.finance_labor_membership_events where studio_id=${id(studioId)};
      set local session_replication_role=origin; delete from public.studio_members where studio_id=${id(studioId)};
      ${account.id ? `delete from public.profiles where id=${id(account.id)};` : ""}
      delete from public.studios where id=${id(studioId)}; commit;`,encoding:"utf8",stdio:["pipe","pipe","pipe"],
  });
  if(account.id)await service.auth.admin.deleteUser(account.id);
});

test("forms → preview → activation → selected import → confirmation → result, with no production Graph or CRM writes",async({page})=>{
  const browserErrors:string[]=[];page.on("pageerror",error=>browserErrors.push(error.message));
  let enabled=false;const importedIds:string[][]=[];const excluded=new Set<string>();
  const lead=(id:string,state:MetaPreview["status"]="not_imported"):MetaPreview=>{
    const status:MetaPreview["status"]=id==="11" && importedIds.length ? "crm" : excluded.has(id) ? "skipped" : state;
    return ({
    id,submitted_at:"2026-10-18T11:00:00Z",client_name:`Fixture ${id}`,phone:id==="13" ? "+48503448352" : "+380501234567",email:`fixture-${id}@example.test`,
    field_data:[{name:"full_name",values:[`Fixture ${id}`]},{name:"phone_number",values:[id==="13" ? "+48503448352" : "+380501234567"]},{name:"email",values:[`fixture-${id}@example.test`]},...(id==="12" ? [] : [{name:"project_type",values:["Fixture apartment"]}])],status,reason:status==="duplicate" ? "duplicate_phone" : status==="incomplete" ? "missing_client_name" : status==="skipped" ? "admin_skipped" : null,eligible:enabled && status==="not_imported",
    custom_disclaimer_responses:id==="12" ? undefined : [{checkbox_key:"privacy",is_checked:true}],
  });};
  const form=()=>({form_id:"10",name:"Fixture form",meta_status:"ACTIVE",meta_created_at:"2024-01-01T00:00:00Z",lifetime_leads_count:11,sync_enabled:enabled,imported:0,pending:0,failed:0});
  await page.route("**/api/integrations/meta-leads/manage?*",async route=>{
    const request=route.request(),url=new URL(request.url());let body:unknown;
    if(request.method()==="GET") {
      const operation=url.searchParams.get("operation");
      if(operation==="forms")body={kind:"forms",forms:[form()],next:url.searchParams.has("after") ? null : "forms-next",diagnostics:{enabledForms:enabled ? 1 : 0,pending:0,failed:0,lastSuccess:null,manualAvailable:true,graphError:null}};
      else if(operation==="availability")body={kind:"availability",count:4,latest:"2026-10-18T11:00:00.000Z",next:null};
      else if(operation==="preview")body={kind:"preview",leads:url.searchParams.has("after") ? [lead("13","duplicate"),lead("14","crm")] : [lead("11"),lead("12")],next:url.searchParams.has("after") ? null : "leads-next"};
      else throw new Error("Unexpected Meta read");
    } else {
      const value=metaMutationSchema.parse(request.postDataJSON());
      if(value.action==="sync"){enabled=value.enabled;body={kind:"saved"};}
      else if(value.action==="exclude"){value.excluded ? excluded.add(value.leadId) : excluded.delete(value.leadId);body={kind:"saved"};}
      else if(value.action==="plan" || value.action==="enqueue"){
        if(value.action==="enqueue")importedIds.push(value.leadIds);
        body={kind:"plan",importable:value.leadIds,existing:0,skipped:0};
      } else if(value.action==="process")body={kind:"status",jobs:value.leadIds.map(leadgen_id=>({leadgen_id,form_id:"10",status:"completed",crm_lead_id:"fixture-crm-id",last_error:null,updated_at:new Date().toISOString()}))};
      else throw new Error("Unexpected Meta write");
    }
    await route.fulfill({json:body});
  });
  await page.context().addCookies([{name:"studioflow-locale",value:"uk",url:"http://localhost:3000"}]);
  await signInLocalTestUser(page,account);await page.goto("/crm/leads");
  await expect(page.getByRole("columnheader",{name:"Телефон",exact:true})).toBeVisible();
  const manualRow=page.getByRole("row").filter({hasText:"Manual UI fixture"});
  await expect(manualRow.getByRole("link",{name:"+48503448352",exact:true})).toBeVisible();
  await expect(manualRow.getByText("Новий",{exact:true})).toHaveCSS("border-top-width","0px");
  await page.screenshot({path:".local/crm-leads-phone-column.png",fullPage:true});
  await page.getByRole("link",{name:"Meta Leads",exact:true}).click();
  await expect(page.getByRole("switch",{name:/Синхронізувати Fixture form/})).not.toBeChecked();
  await expect(page.locator("#meta-sync-info")).toHaveAttribute("aria-hidden","true");
  expect(await page.locator("#meta-sync-info").evaluate(node=>node.getBoundingClientRect().height)).toBe(0);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:".local/meta-leads-forms-mobile.png",fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:".local/meta-leads-forms.png",fullPage:true});
  await page.emulateMedia({colorScheme:"dark"});
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await page.screenshot({path:".local/meta-leads-forms-dark.png",fullPage:true});
  await page.getByRole("button",{name:"Fixture form",exact:true}).click();
  await expect(page.getByText("Заявок: 4",{exact:true})).toBeVisible();
  await expect(page.getByRole("checkbox",{name:"Вибрати заявку 11",exact:true})).toBeDisabled();
  await expect(page.getByText("Імпорт для цієї форми вимкнено",{exact:true})).toBeVisible();
  await page.screenshot({path:".local/meta-leads-preview-disabled.png",fullPage:true});
  await page.getByRole("button",{name:"Увімкнути форму",exact:true}).click();
  await expect(page.getByRole("switch",{name:/Синхронізувати Fixture form/})).toBeChecked();
  await expect(page.getByRole("checkbox",{name:"Вибрати заявку 11",exact:true})).toBeEnabled();
  expect(importedIds).toEqual([]);
  const from=page.getByRole("combobox",{name:"Від",exact:true});
  await from.click();await expect(from).toHaveAttribute("aria-expanded","true");
  await page.keyboard.press("Escape");await expect(from).toHaveAttribute("aria-expanded","false");
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:".local/meta-leads-preview-mobile.png",fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:".local/meta-leads-preview.png",fullPage:true});
  await expect(page.getByRole("checkbox",{name:"Вибрати заявку 13",exact:true})).toBeDisabled();
  await expect(page.getByRole("checkbox",{name:"Вибрати заявку 14",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Вибрати всі придатні",exact:true}).click();
  await expect(page.locator("table tbody tr")).toHaveCount(4);
  await expect(page.getByRole("button",{name:"Відповіді",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Додаткові дані заявки 12",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Додаткові дані заявки 11",exact:true}).click();
  const extra=page.locator('[data-radix-popper-content-wrapper]');
  await expect(extra.getByText("Fixture apartment",{exact:true})).toBeVisible();
  await expect(extra.getByText("fixture-11@example.test",{exact:true})).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox",{name:"Вибрати заявку 12",exact:true}).locator("xpath=ancestor::tr").getByRole("button",{name:"Виключити",exact:true}).click();
  await expect(page.getByRole("checkbox",{name:"Вибрати заявку 12",exact:true})).toBeDisabled();
  await expect(page.getByRole("checkbox",{name:"Вибрати заявку 11",exact:true})).toBeChecked();
  await page.getByRole("button",{name:"Імпортувати вибрані (1)",exact:true}).click();
  const confirmation=page.getByRole("dialog",{name:"Підтвердьте імпорт із Meta"});
  await expect(confirmation.getByText("До обробки: 1. Уже існували: 0. Пропущено: 0.",{exact:true})).toBeVisible();
  expect(importedIds).toEqual([]);await confirmation.getByRole("button",{name:"Підтвердити імпорт",exact:true}).click();
  await expect(page.getByText("Імпортовано: 1 · Уже існували: 0 · Пропущено: 0 · Помилки: 0 · У черзі: 0",{exact:true})).toBeVisible();
  expect(importedIds).toEqual([["11"]]);
  await expect(page.getByRole("checkbox",{name:"Вибрати заявку 11",exact:true})).toBeDisabled();
  await expect(page.getByRole("checkbox",{name:"Вибрати заявку 11",exact:true}).locator("xpath=ancestor::tr").getByText("У CRM",{exact:true})).toBeVisible();
  expect(browserErrors).toEqual([]);
  const count=execFileSync("docker",["exec","-i","supabase_db_design-manager","psql","-U","postgres","-d","postgres","-At"],{input:`select count(*) from public.crm_leads where studio_id=${id(studioId)};`,encoding:"utf8"}).trim();
  expect(count).toBe("1");
});
