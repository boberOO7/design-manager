import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
async function login(page:Page) {
 await page.goto('/login');await page.waitForLoadState('networkidle',{timeout:15_000});await page.locator('input[type="email"]').fill(email);await page.locator('input[type="password"]').fill(password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
 await page.context().addCookies([{name:'studioflow-locale',value:'uk',url:new URL(page.url()).origin}]);
}
async function openDefaultOrder(page:Page) {
 const orders=uk.Finance.orders;
 await page.getByRole('button',{name:new RegExp(`^${orders.title} ·`)}).click();
 const list=page.getByRole('dialog',{name:orders.title,exact:true});
 await list.getByRole('button',{name:new RegExp(`^${orders.defaultName}`)}).click();
 const manager=page.getByRole('dialog',{name:orders.defaultName,exact:true});await expect(manager).toBeVisible();return manager;
}
async function openProposal(page:Page) {
 let manager=page.getByRole('dialog',{name:uk.Finance.orders.defaultName,exact:true});
 if(await manager.count()===0)manager=await openDefaultOrder(page);
 await manager.getByRole('button',{name:uk.Finance.proposal.action,exact:true}).click();
 return page.getByRole('dialog');
}
async function openAgreementEditor(page:Page) {
 let manager=page.getByRole('dialog',{name:uk.Finance.orders.defaultName,exact:true});
 if(await manager.count()===0)manager=await openDefaultOrder(page);
 await manager.getByRole('button',{name:uk.Finance.project.editAgreement,exact:true}).click();
 return page.getByRole('dialog');
}
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
test("shared phone input: Contractor and Commercial Proposal sanity", async ({page},testInfo) => {
 const p=uk.Finance.proposal;
 sql(`update studios set website='https://space-design.pro',email='hello@space.example',phone='0679876543',business_address='Київ',contact_person='Ірина SPACE' where id='${studio}';`);
 await login(page);
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 async function checkPhoneInput(input: Locator) {
  await expect(input).toHaveAttribute('placeholder','+380 (XX) XXX-XX-XX');
  await input.fill('');await input.pressSequentially('067');await expect(input).toHaveValue('+380 (67');
  await input.pressSequentially('1234567');await expect(input).toHaveValue('+380 (67) 123-45-67');await expect(input).toBeFocused();
  await input.pressSequentially('abcЖ@#$');await expect(input).toHaveValue('+380 (67) 123-45-67');
  await input.press('Backspace');await expect(input).toHaveValue('+380 (67) 123-45-6');await input.press('7');await expect(input).toHaveValue('+380 (67) 123-45-67');
  // Replace a middle digit and delete across a separator without jumping the caret to the end.
  await input.evaluate(el=>{if(!(el instanceof HTMLInputElement))throw new Error('Expected input');el.setSelectionRange(11,12);});
  await input.press('9');await expect(input).toHaveValue('+380 (67) 193-45-67');expect(await input.evaluate(el=>el instanceof HTMLInputElement ? el.selectionStart : null)).toBe(12);
  await input.evaluate(el=>{if(!(el instanceof HTMLInputElement))throw new Error('Expected input');el.setSelectionRange(14,14);});
  await input.press('Backspace');await expect(input).toHaveValue('+380 (67) 194-56-7');await input.press('3');await expect(input).toHaveValue('+380 (67) 193-45-67');
  await input.evaluate(el=>{if(!(el instanceof HTMLInputElement))throw new Error('Expected input');el.setSelectionRange(13,13);});
  await input.press('Delete');await expect(input).toHaveValue('+380 (67) 193-56-7');await input.press('4');await expect(input).toHaveValue('+380 (67) 193-45-67');
  await input.press('End');for(let count=0;count<20;count++)await input.press('Backspace');await expect(input).toHaveValue('');
  for(const raw of ['380671234567','+380671234567','0671234567','+38 (067) 123-45-67']) {
   await page.evaluate(text=>navigator.clipboard.writeText(text),raw);await input.focus();await input.press('ControlOrMeta+A');await input.press('ControlOrMeta+V');await expect(input).toHaveValue('+380 (67) 123-45-67');await expect(input).toBeFocused();
  }
  await input.fill('');await input.pressSequentially('+442012345678');await expect(input).toHaveValue('+442012345678');
  await input.pressSequentially('xyz!');await expect(input).toHaveValue('+442012345678');
  await input.fill('+44 (20) 1234-5678');await expect(input).toHaveValue('+44 (20) 1234-5678');
  await input.fill('0671234567');await expect(input).toHaveValue('+380 (67) 123-45-67');
 }
 const c=uk.Contractors;
 await page.goto('/contractors');await page.getByRole('button',{name:c.add,exact:true}).click();
 const contractorDialog=page.getByRole('dialog',{name:c.form.createTitle,exact:true}), contractorPhone=contractorDialog.locator('input[name="phone"]');
 await checkPhoneInput(contractorPhone);
 expect(await contractorPhone.evaluate(el=>{const form=el.closest('form');if(!form)throw new Error('Missing contractor form');return new FormData(form).get('phone');})).toBe('+380 (67) 123-45-67');
 const contractorAppearance=await contractorPhone.evaluate(el=>({height:el.clientHeight,radius:getComputedStyle(el).borderRadius,fontSize:getComputedStyle(el).fontSize}));
 await page.screenshot({path:testInfo.outputPath('contractor-shared-phone.png')});
 await contractorDialog.getByRole('button',{name:c.cancel,exact:true}).click();
 await page.goto(`/projects/${project}?view=finance`);await openProposal(page);
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:p.studioContacts,exact:true}).click();
 const clientPhone=dialog.getByLabel(p.contact,{exact:true}), studioPhone=dialog.getByLabel(p.phone,{exact:true}), person=dialog.getByLabel(p.contactPerson,{exact:true});
 const save=dialog.getByRole('button',{name:p.saveContacts,exact:true});
 await expect(save).toBeDisabled();
 const appearance=()=>save.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,opacity:s.opacity};});
 const disabledAppearance=await appearance();await save.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('proposal-contact-save-disabled.png')});
 for(const input of [clientPhone,studioPhone]) {
  await checkPhoneInput(input);
  expect(await input.evaluate(el=>({height:el.clientHeight,radius:getComputedStyle(el).borderRadius,fontSize:getComputedStyle(el).fontSize}))).toEqual(contractorAppearance);
 }
 const contactFields=dialog.getByRole('region',{name:p.studioContacts,exact:true}).locator('input');
 expect(await contactFields.evaluateAll(elements=>elements.map(el=>el.closest('label')?.firstElementChild?.textContent))).toEqual([p.contactPerson,p.phone,p.email,p.website,p.businessAddress]);
 const pairGap=await studioPhone.evaluate(el=>{const phone=el.closest('label'),person=phone?.previousElementSibling;if(!phone||!person)throw new Error('Missing contact pair');return phone.getBoundingClientRect().top-person.getBoundingClientRect().bottom;});
 expect(pairGap).toBe(8);
 await person.fill('Марія SPACE');await expect(save).toBeEnabled();expect(await appearance()).not.toEqual(disabledAppearance);await expect(save.locator('svg')).toBeVisible();
 await save.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('proposal-contact-save-active.png')});
 await save.click();await expect(dialog.getByText(p.contactsSaved,{exact:true})).toBeVisible();await expect(save).toBeDisabled();await expect.poll(appearance).toEqual(disabledAppearance);
});
test("proposal editor shell: saved and missing contacts, compact select and keyboard", async ({page},testInfo) => {
 const p=uk.Finance.proposal;
 sql(`update studios set website='https://space-design.pro',email='hello@space.example',phone='+380 44 000 00 00',business_address='Київ, вул. Городецького, 12' where id='${studio}';`);
 await login(page);
 await page.goto(`/projects/${project}?view=finance`);await openProposal(page);
 const dialog=page.getByRole('dialog'), contacts=dialog.getByRole('button',{name:p.studioContacts,exact:true}), selector=dialog.getByRole('combobox',{name:p.design,exact:true});
 await expect(contacts).toHaveAttribute('aria-expanded','false');await expect(dialog.getByLabel(p.website,{exact:true})).not.toBeVisible();
 await expect(contacts).toContainText('+38 (044) 000-00-00 · hello@space.example');await expect(dialog.getByText(p.contactsHelp,{exact:true})).toHaveCount(0);
 await expect(selector).toBeEnabled({timeout:60000});await expect(dialog.locator('[data-proposal-pages] canvas')).toBeVisible({timeout:60000});
 expect(await dialog.locator('fieldset').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('proposal-contacts-collapsed.png')});
 await contacts.focus();await contacts.press('Enter');await expect(contacts).toHaveAttribute('aria-expanded','true');
 await expect(dialog.getByLabel(p.website,{exact:true})).toHaveValue('space-design.pro');
 await dialog.getByLabel(p.email,{exact:false}).fill('invalid');await expect(dialog.getByRole('button',{name:p.saveContacts,exact:true})).toBeDisabled();await expect(dialog.getByText(p.contactsInvalid,{exact:true})).toBeVisible();
 await dialog.getByLabel(p.email,{exact:false}).fill('studio@space.example');await dialog.getByRole('button',{name:p.saveContacts,exact:true}).click();await expect(dialog.getByText(p.contactsSaved,{exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('proposal-contacts-expanded.png')});
 expect(sql(`select email from studios where id='${studio}'`)).toBe('studio@space.example');
 await contacts.click();await expect(contacts).toHaveAttribute('aria-expanded','false');await expect(dialog.getByLabel(p.email,{exact:false})).not.toBeVisible();
 await expect(selector).toBeEnabled({timeout:60000});
 for(const [value,label] of [['measured-space','Measured Space'],['quiet-monument','Quiet Monument'],['folded-plane','Folded Plane']] as const) {
  await selector.click();const menu=dialog.getByRole('listbox');await expect(menu).toBeVisible();
  expect(await menu.evaluate(el=>parseFloat(getComputedStyle(el.parentElement!).borderRadius))).toBeGreaterThan(0);
  if(value==='measured-space')await page.screenshot({path:testInfo.outputPath('proposal-design-menu.png')});
  await dialog.getByRole('option',{name:label,exact:true}).click();await expect(selector.getByTitle(label,{exact:true})).toBeVisible();await expect(dialog.locator('[data-proposal-pane]')).toHaveAttribute('data-proposal-variant',value);
  await expect(dialog.locator('[data-proposal-pages]')).toContainText('Олена Коваль');await expect(dialog.locator('[data-proposal-pages]')).toContainText(/4\s*428/);
 }
 await selector.focus();await selector.press('ArrowDown');await expect(dialog.getByRole('option',{name:'Folded Plane',exact:true})).toHaveAttribute('aria-selected','true');
 await selector.press('Home');await selector.press('Enter');await expect(selector.getByTitle(p.originalDesign,{exact:true})).toBeVisible();await expect(selector).toBeFocused();
 expect(await selector.evaluate(el=>{const s=getComputedStyle(el);return s.outlineStyle==='none'&&s.boxShadow!=='none'&&parseFloat(s.borderRadius)>0&&el.getBoundingClientRect().width<240;})).toBe(true);
 await selector.press('ArrowDown');await selector.press('Escape');await expect(dialog).toBeVisible();await expect(dialog.getByRole('listbox')).toHaveCount(0);
 await dialog.getByRole('button',{name:p.close,exact:true}).last().click();await openProposal(page);
 await expect(contacts).toHaveAttribute('aria-expanded','false');await expect(contacts).toContainText('studio@space.example');
 await dialog.getByRole('button',{name:p.close,exact:true}).last().click();
 sql(`update studios set website=null,email=null,phone=null,business_address=null,contact_person=null where id='${studio}';`);
 await openProposal(page);await expect(contacts).toHaveAttribute('aria-expanded','true');await expect(dialog.getByLabel(p.website,{exact:true})).toBeVisible();await expect(dialog.getByLabel(p.email,{exact:false})).toHaveValue('');
 await expect(dialog.getByRole('button',{name:p.saveContacts,exact:true})).toBeDisabled();await page.screenshot({path:testInfo.outputPath('proposal-contacts-missing.png')});
 await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('proposal-shell-mobile.png')});
});
test("live proposal designs → PDF parity → immutable revisions", async ({page}, testInfo) => {
 const p=uk.Finance.proposal, endpoint=`/api/projects/${project}/proposals`;
 await login(page);
 await page.goto(`/projects/${project}?view=finance`);
 const previewRequests: string[]=[];
 page.on('request', request => { if(request.method()==='POST' && request.url().includes(endpoint)) { const body=z.object({intent:z.string(),presentation:z.object({designVariant:z.string()})}).parse(request.postDataJSON());if(body.intent==='preview') previewRequests.push(body.presentation.designVariant); } });
 await openProposal(page);
 const dialog=page.getByRole('dialog'), selector=dialog.getByRole('combobox',{name:p.design,exact:true});
 const labels: Record<string,string>={classic:p.originalDesign,'measured-space':'Measured Space','quiet-monument':'Quiet Monument','folded-plane':'Folded Plane'};
 const chooseDesign=async(value:string)=>{await selector.click();await dialog.getByRole('option',{name:labels[value],exact:true}).click();};
 const pages=dialog.locator('[data-proposal-pages]'), canvas=pages.locator('canvas');
 await expect(selector).toBeEnabled({timeout:60000});await expect(selector.getByTitle(p.originalDesign,{exact:true})).toBeVisible();
 await expect(dialog.getByLabel(p.client,{exact:true})).toHaveValue('Олена Коваль');
 await dialog.getByLabel(p.intro,{exact:true}).fill('Площа уточнюється після обмірів.');
 await expect(selector).toBeEnabled({timeout:60000});
 const previews=new Map<string,string[]>();
 const pixels=()=>canvas.evaluateAll(elements=>elements.map(element=>{if(!(element instanceof HTMLCanvasElement))throw new Error('Expected canvas');return element.toDataURL();}));
 const variants=['measured-space','quiet-monument','folded-plane'] as const;
 const requestCount=previewRequests.length;
 for(const variant of variants) {
  await chooseDesign(variant);await expect(canvas.first()).toBeVisible({timeout:60000});
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
   await expect(selector.getByTitle(labels[saved[index-1].variant],{exact:true})).toBeVisible();await expect(selector).toBeEnabled({timeout:60000});
   await dialog.getByLabel(p.intro,{exact:true}).fill('Площа уточнюється після обмірів.');
   await expect(selector).toBeEnabled({timeout:60000});
  }
  await chooseDesign(variant);await expect(canvas.first()).toBeVisible({timeout:60000});await expect(pages).toContainText('Площа уточнюється');
  const before=await pixels();if(!index)expect(before).toEqual(previews.get(variant));
  await dialog.getByRole('button',{name:p.generate,exact:true}).click();
  await expect(dialog.getByRole('link',{name:p.download,exact:true})).toBeVisible({timeout:60000});await expect(selector).toBeDisabled();await expect(selector.getByTitle(labels[variant],{exact:true})).toBeVisible();
  await expect.poll(pixels).toEqual(before);
  const href=await dialog.getByRole('link',{name:p.download,exact:true}).getAttribute('href');if(!href)throw new Error('Missing PDF download');
  const response=await page.request.get(href);expect(response.headers()['content-type']).toBe('application/pdf');const bytes=await response.body();expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
  writeFileSync(testInfo.outputPath(`${variant}-saved.pdf`),bytes);saved.push({href,bytes,variant});
  expect(sql(`select snapshot->>'designVariant' from finance_project_proposals where project_id='${project}' and revision=${index+1}`)).toBe(variant);
  for(const previous of saved)expect(await (await page.request.get(previous.href)).body()).toEqual(previous.bytes);
  await dialog.getByRole('button',{name:p.close,exact:true}).last().click();await openProposal(page);
  await expect(selector.getByTitle(labels[variant],{exact:true})).toBeVisible();await expect(selector).toBeDisabled();await expect.poll(pixels).toEqual(before);
 }
 expect(sql(`select string_agg(snapshot->>'designVariant',',' order by revision) from finance_project_proposals where project_id='${project}'`)).toBe('quiet-monument,measured-space,folded-plane');
 expect(sql(`select count(distinct snapshot->>'gross') from finance_project_proposals where project_id='${project}'`)).toBe('1');
 expect(sql(`select count(distinct snapshot->'rows') from finance_project_proposals where project_id='${project}'`)).toBe('1');
});
test("proposal phones and contact person: defaults, overrides and immutable snapshots", async ({page},testInfo) => {
 const p=uk.Finance.proposal;
 sql(`update studios set website='https://space-design.pro',email='hello@space.example',phone='0679876543',business_address='Київ, вул. Городецького, 12',contact_person='Ірина SPACE' where id='${studio}';
 insert into crm_leads(studio_id,client_name,first_contact_date,status,project_id,phone,email,company) values('${studio}','Олена Коваль','2026-09-01','won','${project}','0671234567','client@example.test','Client company');`);
 await login(page);
 await page.goto(`/projects/${project}?view=finance`);await openProposal(page);
 const dialog=page.getByRole('dialog'), contacts=dialog.getByRole('button',{name:p.studioContacts,exact:true}), selector=dialog.getByRole('combobox',{name:p.design,exact:true});
 const clientPhone=dialog.getByLabel(p.contact,{exact:true}), studioPhone=dialog.getByLabel(p.phone,{exact:true}), person=dialog.getByLabel(p.contactPerson,{exact:true});
 const pages=dialog.locator('[data-proposal-pages]'), generate=dialog.getByRole('button',{name:p.generate,exact:true});
 if(await dialog.getByRole('button',{name:p.newRevision,exact:true}).isVisible())await dialog.getByRole('button',{name:p.newRevision,exact:true}).click();
 await expect(contacts).toHaveAttribute('aria-expanded','false');await expect(contacts).toContainText('Ірина SPACE · +38 (067) 987-65-43 · hello@space.example');await expect(contacts).not.toContainText('space-design.pro');
 await expect(clientPhone).toHaveValue('+380 (67) 123-45-67');
 for(const copy of [p.documentLanguage,p.help,p.contactsHelp])await expect(dialog.getByText(copy,{exact:true})).toHaveCount(0);
 await contacts.focus();await contacts.press('Enter');await expect(contacts).toHaveAttribute('aria-expanded','true');await expect(person).toHaveValue('Ірина SPACE');
 await expect(studioPhone).toHaveValue('+380 (67) 987-65-43');
 for(const [input,international] of [[clientPhone,'+44 (20) 1234-5678'],[studioPhone,'+1 (415) 555-2671']] as const) {
  await input.fill(international);await input.press('Tab');await expect(input).toHaveValue(international);
 }
 for(const raw of ['0671234567','380 67 123 45 67','+38 (067) 123-45-67','00380671234567']) {
  await clientPhone.fill(raw);await clientPhone.press('Tab');await expect(clientPhone).toHaveValue('+380 (67) 123-45-67');
 }
 await studioPhone.fill('380679876543');await studioPhone.press('Tab');await expect(studioPhone).toHaveValue('+380 (67) 987-65-43');
 await person.fill('Марія SPACE');await dialog.getByRole('button',{name:p.saveContacts,exact:true}).click();await expect(dialog.getByText(p.contactsSaved,{exact:true})).toBeVisible();
 expect(sql(`select contact_person||' · '||phone from studios where id='${studio}'`)).toBe('Марія SPACE · +38 (067) 987-65-43');
 expect(sql(`select phone||' · '||email||' · '||company from crm_leads where project_id='${project}'`)).toBe('0671234567 · client@example.test · Client company');
 await contacts.click();await expect(person).not.toBeVisible();await expect(contacts).toContainText('Марія SPACE');
 await dialog.getByRole('button',{name:p.close,exact:true}).last().click();await openProposal(page);
 if(await dialog.getByRole('button',{name:p.newRevision,exact:true}).isVisible())await dialog.getByRole('button',{name:p.newRevision,exact:true}).click();
 await expect(contacts).toHaveAttribute('aria-expanded','false');await contacts.click();await expect(person).toHaveValue('Марія SPACE');
 const note=dialog.getByLabel(p.intro,{exact:true}), originalHeight=await note.evaluate(el=>el.clientHeight);
 await note.fill('Площа уточнюється після обмірів.\n'.repeat(8));expect(await note.evaluate(el=>el.clientHeight)).toBeGreaterThan(originalHeight);expect(await note.evaluate(el=>getComputedStyle(el).resize)).toBe('none');
 await note.fill('Площа уточнюється після обмірів.');
 await person.fill('');await expect(selector).toBeEnabled({timeout:60000});await expect(pages).not.toContainText('Марія SPACE');
 await person.fill('Оксана SPACE');await expect(generate).toBeEnabled({timeout:60000});
 for(const [variant,label] of [['measured-space','Measured Space'],['quiet-monument','Quiet Monument'],['folded-plane','Folded Plane']] as const) {
  await selector.click();await dialog.getByRole('option',{name:label,exact:true}).click();await expect(dialog.locator('[data-proposal-pane]')).toHaveAttribute('data-proposal-variant',variant);
  await expect(pages).toContainText('Оксана SPACE');await expect(pages).toContainText('+38 (067) 123-45-67');await expect(pages).toContainText('+38 (067) 987-65-43');
 }
 await page.screenshot({path:testInfo.outputPath('proposal-phones-contact-person.png')});
 await generate.click();const download=dialog.getByRole('link',{name:p.download,exact:true});await expect(download).toBeVisible({timeout:60000});
 const href=await download.getAttribute('href');if(!href)throw new Error('Missing PDF');
 const bytes=await (await page.request.get(href)).body();
 const frozen=sql(`select snapshot::text from finance_project_proposals where project_id='${project}' order by revision desc limit 1`);
 expect(JSON.parse(frozen).studioContactDetails.contactPerson).toBe('Оксана SPACE');expect(JSON.parse(frozen).contact).toBe('+38 (067) 123-45-67');
 expect(sql(`select contact_person from studios where id='${studio}'`)).toBe('Марія SPACE');
 await dialog.getByRole('button',{name:p.close,exact:true}).last().click();await openProposal(page);await expect(pages).toContainText('Оксана SPACE');
 await dialog.getByRole('button',{name:p.newRevision,exact:true}).click();await expect(contacts).toHaveAttribute('aria-expanded','false');await contacts.click();await expect(person).toHaveValue('Марія SPACE');
 await person.fill('Наталія SPACE');await studioPhone.fill('+44 (20) 1234-5678');await studioPhone.press('Tab');await expect(studioPhone).toHaveValue('+44 (20) 1234-5678');
 await dialog.getByRole('button',{name:p.saveContacts,exact:true}).click();await expect(dialog.getByText(p.contactsSaved,{exact:true})).toBeVisible();expect(sql(`select contact_person||' · '||phone from studios where id='${studio}'`)).toBe('Наталія SPACE · +44 (20) 1234-5678');
 await expect(generate).toBeEnabled({timeout:60000});await expect(pages).toContainText('Наталія SPACE');await expect(pages).toContainText('+44 (20) 1234-5678');await generate.click();await expect(download).toBeVisible({timeout:60000});
 expect(await (await page.request.get(href)).body()).toEqual(bytes);
 const frozenId=new URL(href,'http://localhost:3000').searchParams.get('id');
 expect(sql(`select snapshot::text from finance_project_proposals where id='${frozenId}'`)).toBe(frozen);
 // A genuinely empty studio profile opens for editing rather than hiding missing defaults.
 sql(`update studios set website=null,email=null,phone=null,business_address=null,contact_person=null where id='${studio}';`);
 await dialog.getByRole('button',{name:p.newRevision,exact:true}).click();await expect(contacts).toHaveAttribute('aria-expanded','true');await expect(person).toHaveValue('');await expect(studioPhone).toHaveValue('');
 await page.screenshot({path:testInfo.outputPath('proposal-missing-contact-defaults.png')});
});
test("compact Finance schedule and proposal stage descriptions preserve dates and history", async ({page},testInfo) => {
 const f=uk.Finance, b=f.builder, p=f.project, proposal=f.proposal;
 sql(`update finance_expected_items set
 due_date=case description when 'Планування' then date '2026-10-12' when 'Візуалізація' then date '2026-10-26' else date '2026-11-02' end,
 expected_payment_date=case description when 'Планування' then date '2026-10-19' when 'Візуалізація' then null else date '2026-11-02' end,
 client_note=case description when 'Планування' then 'Перед початком робіт.' when 'Візуалізація' then 'Після погодження планування.' else null end
 where studio_id='${studio}' and id in(select id from finance_project_plan_items where project_id='${project}');`);
 const dates=()=>sql(`select jsonb_agg(jsonb_build_object('id',id,'due',due_date,'expected',expected_payment_date) order by id) from finance_project_plan_items where project_id='${project}'`);
 const notes=()=>sql(`select jsonb_agg(jsonb_build_object('id',id,'note',client_note) order by id) from finance_project_plan_items where project_id='${project}'`);
 const datesBefore=dates(),notesBefore=notes();
 await login(page);
 await page.goto(`/projects/${project}?view=finance`);await openAgreementEditor(page);
 const dialog=page.getByRole('dialog'),rows=dialog.locator('[data-plan-row]');
 await expect(rows).toHaveCount(3);await expect(dialog.getByLabel(b.clientNote,{exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:f.planning.differentExpectedDate,exact:true})).toHaveCount(0);
 await expect(dialog.locator('[data-project-discount] p[aria-live]')).toHaveCount(0);await expect(dialog.locator('[data-price-summary] [data-discount-breakdown]')).toBeVisible();
 await expect(rows.nth(1).getByRole('combobox',{name:f.planning.expectedDate,exact:true})).toContainText(b.expectedDateFallback);
 await expect(rows.nth(2).getByRole('combobox',{name:f.planning.expectedDate,exact:true})).toContainText('02.11.2026');
 for(const [label,count] of [['50 / 50',2],['30 / 50 / 20',3],['25 / 25 / 25 / 25',4]] as const) {
  await dialog.getByRole('button',{name:label,exact:true}).click();await expect(rows).toHaveCount(count);
  for(const row of await rows.all()) {
   const alignment=await row.evaluate(el=>{const controls=el.querySelectorAll('[role="combobox"]');if(controls.length!==2)throw new Error('Missing date controls');const [due,expected]=Array.from(controls,node=>node.getBoundingClientRect());return {dueY:due.y,expectedY:expected.y,dueRight:due.right,expectedX:expected.x,height:el.clientHeight};});
   expect(alignment.expectedY).toBe(alignment.dueY);expect(alignment.expectedX).toBeGreaterThan(alignment.dueRight);expect(alignment.height).toBeLessThan(60);
  }
  await dialog.getByRole('button',{name:b.custom,exact:true}).click();await expect(rows).toHaveCount(count);await expect(rows.first().getByLabel(f.movements.amount,{exact:true})).toBeEditable();
 }
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('compact-schedule-desktop.png')});
 await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await rows.first().scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('compact-schedule-narrow.png')});
 await dialog.getByRole('button',{name:f.movements.close,exact:true}).click();await page.setViewportSize({width:1440,height:1000});
 await openAgreementEditor(page);
 const reason=dialog.getByLabel(p.reason,{exact:true}), height=await reason.evaluate(el=>el.clientHeight);
 await reason.fill('Перегляд домовленості.\n'.repeat(7));expect(await reason.evaluate(el=>el.clientHeight)).toBeGreaterThan(height);expect(await reason.evaluate(el=>getComputedStyle(el).resize)).toBe('none');await reason.fill('Уточнення формулювання домовленості.');
 await dialog.getByRole('button',{name:b.saveRevision,exact:true}).click();await expect(page.getByRole('dialog',{name:uk.Finance.orders.defaultName,exact:true})).toBeVisible();expect(dates()).toBe(datesBefore);expect(notes()).toBe(notesBefore);
 // An empty expected date keeps its nullable representation and follows an edited due date.
 await openAgreementEditor(page);
 const due=rows.nth(1).getByRole('combobox',{name:f.planning.dueDate,exact:true}),expected=rows.nth(1).getByRole('combobox',{name:f.planning.expectedDate,exact:true});
 await due.click();await page.getByRole('gridcell',{name:'27',exact:true}).click();
 await expect(expected).toContainText(b.expectedDateFallback);
 await expected.click();await page.getByRole('gridcell',{name:'23',exact:true}).click();await expect(expected).toContainText('23.10.2026');
 await expected.click();await page.getByRole('button',{name:'Очистити',exact:true}).click();await expect(expected).toContainText(b.expectedDateFallback);
 await reason.fill('Уточнення дати другого платежу.');await dialog.getByRole('button',{name:b.saveRevision,exact:true}).click();await expect(page.getByRole('dialog',{name:uk.Finance.orders.defaultName,exact:true})).toBeVisible();
 expect(sql(`select due_date||'|'||coalesce(expected_payment_date::text,'NULL')||'|'||coalesce(expected_payment_date,due_date)::text from finance_project_plan_items where project_id='${project}' and description='Візуалізація'`)).toBe('2026-10-27|NULL|2026-10-27');expect(notes()).toBe(notesBefore);
 // The hidden protected-row note is preserved with settled payment history.
 sql(`select set_config('request.jwt.claim.sub','${actor}',false);do $$declare item record;begin
 select * into item from finance_project_plan_items where project_id='${project}' and description='Планування';
 perform record_finance_expected_payment('${studio}',gen_random_uuid(),item.id,jsonb_build_object('kind','incoming','date','2026-10-02','amount','100','accountId','${account}','categoryId',item.category_id),100);end $$;`);
 const protectedBefore=sql(`select to_jsonb(e) from finance_expected_items e where id in(select id from finance_project_plan_items where project_id='${project}' and has_settlement_history)`);
 await page.reload();await openAgreementEditor(page);await expect(dialog.getByText(b.protectedHelp,{exact:true})).toBeVisible();await expect(dialog.getByLabel(b.clientNote,{exact:true})).toHaveCount(0);
 await reason.fill('Оновлення редакції зі збереженням оплат.');await dialog.getByRole('button',{name:b.saveRevision,exact:true}).click();await expect(page.getByRole('dialog',{name:uk.Finance.orders.defaultName,exact:true})).toBeVisible();
 expect(sql(`select to_jsonb(e) from finance_expected_items e where id in(select id from finance_project_plan_items where project_id='${project}' and has_settlement_history)`)).toBe(protectedBefore);expect(notes()).toBe(notesBefore);
 await openProposal(page);
 if(await dialog.getByRole('button',{name:proposal.newRevision,exact:true}).isVisible())await dialog.getByRole('button',{name:proposal.newRevision,exact:true}).click();
 const stageNotes=dialog.getByRole('button',{name:proposal.stageNotes,exact:true});await expect(stageNotes).toHaveAttribute('aria-expanded','true');
 const stage=(name:string)=>dialog.getByLabel(proposal.stageNote.replace('{name}',name),{exact:true});
 await expect(stage('Планування')).toHaveValue('Перед початком робіт.');await expect(stage('Візуалізація')).toHaveValue('Після погодження планування.');
 await stage('Планування').fill('Погодження функціонального планування.');await stage('Візуалізація').fill('');
 await expect(dialog.getByRole('button',{name:proposal.generate,exact:true})).toBeEnabled({timeout:60000});await expect(dialog.locator('[data-proposal-pages]')).toContainText('Погодження функціонального планування.');await expect(dialog.locator('[data-proposal-pages]')).not.toContainText('Після погодження планування.');expect(notes()).toBe(notesBefore);
 await page.screenshot({path:testInfo.outputPath('proposal-stage-descriptions.png')});
 await dialog.getByRole('button',{name:proposal.generate,exact:true}).click();const download=dialog.getByRole('link',{name:proposal.download,exact:true});await expect(download).toBeVisible({timeout:60000});
 const href=await download.getAttribute('href');if(!href)throw new Error('Missing proposal PDF');const bytes=await (await page.request.get(href)).body();const id=new URL(href,'http://localhost:3000').searchParams.get('id');
 const frozen=sql(`select snapshot::text from finance_project_proposals where id='${id}'`);const generated=z.object({rows:z.array(z.object({name:z.string(),note:z.string()}))}).parse(JSON.parse(frozen));expect(generated.rows.find(row=>row.name==='Планування')?.note).toBe('Погодження функціонального планування.');expect(generated.rows.find(row=>row.name==='Візуалізація')?.note).toBe('');
 await dialog.getByRole('button',{name:proposal.newRevision,exact:true}).click();await expect(stage('Планування')).toHaveValue('Перед початком робіт.');await stage('Планування').fill('Опис для наступної редакції.');await expect(dialog.getByRole('button',{name:proposal.generate,exact:true})).toBeEnabled({timeout:60000});await dialog.getByRole('button',{name:proposal.generate,exact:true}).click();await expect(download).toBeVisible({timeout:60000});
 expect(await (await page.request.get(href)).body()).toEqual(bytes);expect(sql(`select snapshot::text from finance_project_proposals where id='${id}'`)).toBe(frozen);expect(notes()).toBe(notesBefore);
 // Empty notes in this isolated fixture produce a collapsed section in a fresh draft.
 sql(`update finance_expected_items set client_note='' where studio_id='${studio}' and id in(select id from finance_project_plan_items where project_id='${project}');`);
 await dialog.getByRole('button',{name:proposal.newRevision,exact:true}).click();await expect(stageNotes).toHaveAttribute('aria-expanded','false');await expect(stage('Планування')).not.toBeVisible();await stageNotes.click();await expect(stage('Планування')).toHaveValue('');
});
test.afterAll(async()=>{
 sql(`begin;set local session_replication_role=replica;
 delete from finance_project_proposals where studio_id='${studio}';delete from finance_allocations where studio_id='${studio}';delete from finance_movement_entries where studio_id='${studio}';delete from finance_movements where studio_id='${studio}';delete from finance_project_items where studio_id='${studio}';delete from finance_project_plan_revisions where studio_id='${studio}';delete from finance_project_terms where studio_id='${studio}';delete from finance_expected_items where studio_id='${studio}';delete from finance_project_orders where studio_id='${studio}';delete from finance_planning_requests where studio_id='${studio}';delete from finance_accounts where studio_id='${studio}';delete from finance_categories where studio_id='${studio}';delete from finance_settings where studio_id='${studio}';delete from notifications where studio_id='${studio}';delete from project_activity where project_id='${project}';delete from project_task_stage_columns where project_id='${project}';delete from crm_leads where studio_id='${studio}';delete from projects where studio_id='${studio}';delete from studio_members where studio_id='${studio}';delete from studios where id='${studio}';commit;`);
 if(actor){const result=await client.auth.admin.deleteUser(actor);if(result.error)throw result.error;}
});
