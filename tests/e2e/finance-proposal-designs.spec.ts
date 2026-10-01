import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import uk from "../../messages/uk.json";
import type { Database } from "../../src/types/database.types";

const local=z.object({EQUIPMENT_TEST_SUPABASE_URL:z.url(),EQUIPMENT_TEST_SERVICE_KEY:z.string()}).parse(process.env);
if(!["127.0.0.1","localhost"].includes(new URL(local.EQUIPMENT_TEST_SUPABASE_URL).hostname))throw new Error("Local Supabase required");
const client=createClient<Database>(local.EQUIPMENT_TEST_SUPABASE_URL,local.EQUIPMENT_TEST_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const studio=randomUUID(),project=randomUUID(),account=randomUUID(),email=`proposal-${randomUUID()}@example.test`,password=`Proposal-${randomUUID()}`;
let actor="";
const sql=(statement:string)=>execFileSync("docker",["exec","-i","supabase_db_design-manager","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At"],{input:statement,encoding:"utf8"}).trim();
test.beforeAll(async()=>{
 await client.from("studios").insert({id:studio,name:"Proposal design browser test"}).throwOnError();
 const created=await client.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;actor=created.data.user.id;
 await client.from("profiles").upsert({id:actor,email,full_name:"Proposal admin",system_role:"admin",is_active:true}).throwOnError();
 await client.from("studio_members").insert({studio_id:studio,user_id:actor,system_role:"admin"}).throwOnError();
 sql(`insert into finance_settings(studio_id,base_currency,cutover_date,created_by) values('${studio}','EUR','2026-09-01','${actor}');
 insert into finance_accounts(id,studio_id,name,currency,opening_balance,created_by) values('${account}','${studio}','Bank','EUR',0,'${actor}');
 select set_config('request.jwt.claim.sub','${actor}',false);select finalize_finance_setup('${studio}');
 insert into projects(id,studio_id,name,total_area_m2,start_date,created_by,status,client_name,city,site_address,country_code) values('${project}','${studio}','336 Клініка',100,'2026-09-01','${actor}','active','Олена Коваль','Київ','вул. Городецького, 12','UA');
 select save_finance_project_plan('${studio}','${randomUUID()}','${project}',jsonb_build_object(
 'revision',0,'pricingMethod','area','area','100','rate','40','amount','4000','currency','EUR',
 'discountType','percentage','discountValue','10','vatRate','23','priceBasis','net','revenueTaxRate','6','reason','Agreement','known','[]'::jsonb,
 'items',jsonb_build_array(jsonb_build_object('id','','name','Планування','amount','1080','percentage','30','clientNote','Перед початком робіт.'),jsonb_build_object('id','','name','Візуалізація','amount','1800','percentage','50'),jsonb_build_object('id','','name','Документація','amount','720','percentage','20'))));`);
});
test("live proposal designs → PDF parity → immutable revisions", async ({page}, testInfo) => {
 const p=uk.Finance.proposal, endpoint=`/api/projects/${project}/proposals`;
 await page.goto('/login');await page.locator('input[type="email"]').fill(email);await page.locator('input[type="password"]').fill(password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
 await page.context().addCookies([{name:'studioflow-locale',value:'uk',url:new URL(page.url()).origin}]);
 await page.goto(`/projects/${project}?view=finance`);
 const previewRequests: string[]=[];
 page.on('request', request => { if(request.method()==='POST' && request.url().includes(endpoint)) { const body=z.object({intent:z.string(),presentation:z.object({designVariant:z.string()})}).parse(request.postDataJSON());if(body.intent==='preview') previewRequests.push(body.presentation.designVariant); } });
 await page.getByRole('button',{name:p.action,exact:true}).click();
 const dialog=page.getByRole('dialog'), selector=dialog.getByRole('combobox',{name:p.design,exact:true});
 const pages=dialog.locator('[data-proposal-pages]'), canvas=pages.locator('canvas');
 await expect(selector).toBeEnabled({timeout:60000});await expect(selector).toHaveValue('classic');
 await expect(dialog.getByLabel(p.client,{exact:true})).toHaveValue('Олена Коваль');
 await dialog.getByLabel(p.intro,{exact:true}).fill('Площа уточнюється після обмірів.');
 await expect(selector).toBeEnabled({timeout:60000});
 const previews=new Map<string,string[]>();
 const pixels=()=>canvas.evaluateAll(elements=>elements.map(element=>{if(!(element instanceof HTMLCanvasElement))throw new Error('Expected canvas');return element.toDataURL();}));
 const variants=['measured-space','quiet-monument','folded-plane'] as const;
 const requestCount=previewRequests.length;
 for(const variant of variants) {
  await selector.selectOption(variant);await expect(canvas.first()).toBeVisible({timeout:60000});
  await expect(pages).toContainText('Клініка');await expect(pages).toContainText('Олена Коваль');await expect(pages).toContainText('Городецького');
  await expect(pages).toContainText(/4\s*428/);await expect(pages).toContainText(/Знижка\s*10\s*%/);await expect(pages).toContainText(/ПДВ\s*23\s*%/);
  await expect(pages).toContainText(/100\s*м²\s*×\s*49,2\s*EUR/);
  if(variant==='quiet-monument')await expect(pages).toContainText(/\nE\s*U\s*R\n/);
  for(const stage of ['Планування','Візуалізація','Документація'])await expect(pages).toContainText(stage);
  await expect(pages).toContainText('Площа уточнюється');await expect(pages).not.toContainText(/P&L|Податок з доходу|Measured Space|Quiet Monument|Folded Plane/);
  previews.set(variant,await pixels());await page.screenshot({path:testInfo.outputPath(`${variant}-live.png`)});
 }
 expect(previewRequests.length).toBe(requestCount);
 expect(new Set([...previews.values()].map(value=>JSON.stringify(value))).size).toBe(3);
 const saved: {href:string;bytes:Buffer;variant:string}[]=[];
 for(const [index,variant] of (['quiet-monument','measured-space','folded-plane'] as const).entries()) {
  if(index) {
   // New drafts inherit the latest revision, even while viewing an older revision.
   await dialog.getByRole('button',{name:p.revision.replace('{number}','1'),exact:true}).click();
   await dialog.getByRole('button',{name:p.newRevision,exact:true}).click();
   await expect(selector).toHaveValue(saved[index-1].variant);await expect(selector).toBeEnabled({timeout:60000});
   await dialog.getByLabel(p.intro,{exact:true}).fill('Площа уточнюється після обмірів.');
   await expect(selector).toBeEnabled({timeout:60000});
  }
  await selector.selectOption(variant);await expect(canvas.first()).toBeVisible({timeout:60000});await expect(pages).toContainText('Площа уточнюється');
  const before=await pixels();if(!index)expect(before).toEqual(previews.get(variant));
  await dialog.getByRole('button',{name:p.generate,exact:true}).click();
  await expect(dialog.getByRole('link',{name:p.download,exact:true})).toBeVisible({timeout:60000});await expect(selector).toBeDisabled();await expect(selector).toHaveValue(variant);
  await expect.poll(pixels).toEqual(before);
  const href=await dialog.getByRole('link',{name:p.download,exact:true}).getAttribute('href');if(!href)throw new Error('Missing PDF download');
  const response=await page.request.get(href);expect(response.headers()['content-type']).toBe('application/pdf');const bytes=await response.body();expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
  writeFileSync(testInfo.outputPath(`${variant}-saved.pdf`),bytes);saved.push({href,bytes,variant});
  expect(sql(`select snapshot->>'designVariant' from finance_project_proposals where project_id='${project}' and revision=${index+1}`)).toBe(variant);
  for(const previous of saved)expect(await (await page.request.get(previous.href)).body()).toEqual(previous.bytes);
  await dialog.getByRole('button',{name:p.close,exact:true}).last().click();await page.getByRole('button',{name:p.action,exact:true}).click();
  await expect(selector).toHaveValue(variant);await expect(selector).toBeDisabled();await expect.poll(pixels).toEqual(before);
 }
 expect(sql(`select string_agg(snapshot->>'designVariant',',' order by revision) from finance_project_proposals where project_id='${project}'`)).toBe('quiet-monument,measured-space,folded-plane');
 expect(sql(`select count(distinct snapshot->>'gross') from finance_project_proposals where project_id='${project}'`)).toBe('1');
 expect(sql(`select count(distinct snapshot->'rows') from finance_project_proposals where project_id='${project}'`)).toBe('1');
});
test.afterAll(async()=>{
 sql(`begin;set local session_replication_role=replica;
 delete from finance_project_proposals where studio_id='${studio}';delete from finance_project_items where studio_id='${studio}';delete from finance_project_plan_revisions where studio_id='${studio}';delete from finance_project_terms where studio_id='${studio}';delete from finance_expected_items where studio_id='${studio}';delete from finance_planning_requests where studio_id='${studio}';delete from finance_accounts where studio_id='${studio}';delete from finance_categories where studio_id='${studio}';delete from finance_settings where studio_id='${studio}';delete from notifications where studio_id='${studio}';delete from project_activity where project_id='${project}';delete from project_task_stage_columns where project_id='${project}';delete from projects where studio_id='${studio}';delete from studio_members where studio_id='${studio}';delete from studios where id='${studio}';commit;`);
 if(actor){const result=await client.auth.admin.deleteUser(actor);if(result.error)throw result.error;}
});
