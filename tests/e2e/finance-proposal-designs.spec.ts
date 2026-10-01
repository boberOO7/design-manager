import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
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
test("shared phone input: Contractor and Commercial Proposal sanity", async ({page},testInfo) => {
 const p=uk.Finance.proposal;
 sql(`update studios set website='https://space-design.pro',email='hello@space.example',phone='0679876543',business_address='Київ',contact_person='Ірина SPACE' where id='${studio}';`);
 await page.goto('/login');await page.locator('input[type="email"]').fill(email);await page.locator('input[type="password"]').fill(password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
 await page.context().addCookies([{name:'studioflow-locale',value:'uk',url:new URL(page.url()).origin}]);
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
 await page.goto(`/projects/${project}?view=finance`);await page.getByRole('button',{name:p.action,exact:true}).click();
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
 await page.goto('/login');await page.locator('input[type="email"]').fill(email);await page.locator('input[type="password"]').fill(password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
 await page.context().addCookies([{name:'studioflow-locale',value:'uk',url:new URL(page.url()).origin}]);
 await page.goto(`/projects/${project}?view=finance`);await page.getByRole('button',{name:p.action,exact:true}).click();
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
 await dialog.getByRole('button',{name:p.close,exact:true}).last().click();await page.getByRole('button',{name:p.action,exact:true}).click();
 await expect(contacts).toHaveAttribute('aria-expanded','false');await expect(contacts).toContainText('studio@space.example');
 await dialog.getByRole('button',{name:p.close,exact:true}).last().click();
 sql(`update studios set website=null,email=null,phone=null,business_address=null,contact_person=null where id='${studio}';`);
 await page.getByRole('button',{name:p.action,exact:true}).click();await expect(contacts).toHaveAttribute('aria-expanded','true');await expect(dialog.getByLabel(p.website,{exact:true})).toBeVisible();await expect(dialog.getByLabel(p.email,{exact:false})).toHaveValue('');
 await expect(dialog.getByRole('button',{name:p.saveContacts,exact:true})).toBeDisabled();await page.screenshot({path:testInfo.outputPath('proposal-contacts-missing.png')});
 await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('proposal-shell-mobile.png')});
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
  await dialog.getByRole('button',{name:p.close,exact:true}).last().click();await page.getByRole('button',{name:p.action,exact:true}).click();
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
 await page.goto('/login');await page.locator('input[type="email"]').fill(email);await page.locator('input[type="password"]').fill(password);await page.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard/);
 await page.context().addCookies([{name:'studioflow-locale',value:'uk',url:new URL(page.url()).origin}]);
 await page.goto(`/projects/${project}?view=finance`);await page.getByRole('button',{name:p.action,exact:true}).click();
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
 await dialog.getByRole('button',{name:p.close,exact:true}).last().click();await page.getByRole('button',{name:p.action,exact:true}).click();
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
 await dialog.getByRole('button',{name:p.close,exact:true}).last().click();await page.getByRole('button',{name:p.action,exact:true}).click();await expect(pages).toContainText('Оксана SPACE');
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
test.afterAll(async()=>{
 sql(`begin;set local session_replication_role=replica;
 delete from finance_project_proposals where studio_id='${studio}';delete from finance_project_items where studio_id='${studio}';delete from finance_project_plan_revisions where studio_id='${studio}';delete from finance_project_terms where studio_id='${studio}';delete from finance_expected_items where studio_id='${studio}';delete from finance_planning_requests where studio_id='${studio}';delete from finance_accounts where studio_id='${studio}';delete from finance_categories where studio_id='${studio}';delete from finance_settings where studio_id='${studio}';delete from notifications where studio_id='${studio}';delete from project_activity where project_id='${project}';delete from project_task_stage_columns where project_id='${project}';delete from crm_leads where studio_id='${studio}';delete from projects where studio_id='${studio}';delete from studio_members where studio_id='${studio}';delete from studios where id='${studio}';commit;`);
 if(actor){const result=await client.auth.admin.deleteUser(actor);if(result.error)throw result.error;}
});
