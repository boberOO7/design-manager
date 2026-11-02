import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Explicitly local: never use a connection string or a linked project.
const args=["exec","-i","supabase_db_design-manager","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At"];
const studio=randomUUID(),page="99902002759",form="999789";
const sql=(input:string)=>execFileSync("docker",args,{input,encoding:"utf8"}).trim();
function session(input:string) {
  const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"]});
  let output="",error="";
  child.stdout.on("data",data=>{output+=data.toString();});child.stderr.on("data",data=>{error+=data.toString();});
  const done=new Promise<string>((resolve,reject)=>{child.on("error",reject);child.on("exit",code=>code===0 ? resolve(output) : reject(new Error(error)));});
  child.stdin.write(input);
  return {child,done,output:()=>output};
}
async function until(check:()=>boolean) {
  const end=Date.now()+8000;
  while(!check()) {if(Date.now()>end)throw new Error("Local concurrency barrier timed out");await new Promise(resolve=>setTimeout(resolve,40));}
}
const lease=(lead:string)=>`(select lease_token from public.meta_lead_jobs where page_id='${page}' and leadgen_id='${lead}')`;
const complete=(lead:string,phone:string)=>`select public.complete_meta_lead_job('${page}','${lead}','${studio}',${lease(lead)},'{"client_name":"Fixture import","phone":"${phone}"}');`;
function prepare(ids:string[]) {
  sql(`set role service_role;select public.enqueue_meta_lead_jobs('${page}','${studio}','${JSON.stringify(ids.map(leadgen_id=>({leadgen_id,form_id:form})))}',true,true);
    select count(*) from public.claim_meta_lead_jobs('${page}','${studio}');
    update public.meta_lead_jobs set payload=jsonb_build_object('id',leadgen_id),submitted_at=now() where page_id='${page}';`);
}
async function waiters(count:number) {
  await until(()=>Number(sql("select count(*) from pg_stat_activity where application_name='MetaPhoneFixture' and wait_event='advisory';"))===count);
}

describe.skipIf(process.env.META_LOCAL_DB_TESTS!=="1")("local atomic Meta phone deduplication",()=>{
  beforeAll(()=>{sql(`insert into public.studios(id,name) values('${studio}','Meta concurrency fixture');insert into public.meta_lead_forms(page_id,form_id,studio_id,sync_enabled) values('${page}','${form}','${studio}',true);`);});
  afterAll(()=>{sql(`delete from public.crm_leads where studio_id='${studio}';delete from public.studios where id='${studio}';`);});
  it("serializes simultaneous Meta completions into one CRM lead",async()=>{
    prepare(["1","2"]);
    const barrier=session(`begin;select pg_advisory_xact_lock(hashtextextended('studioflow:crm_lead_phone:${studio}',0));select 'ready';\n`);
    const workers:Array<ReturnType<typeof session>>=[];
    try {
      await until(()=>barrier.output().includes("ready"));
      for(const id of ["1","2"]) {const worker=session(`set application_name='MetaPhoneFixture';set role service_role;${complete(id,"+380501234567")}\n`);worker.child.stdin.end();workers.push(worker);}
      await waiters(2);barrier.child.stdin.end("commit;\n");
      await Promise.all([barrier.done,...workers.map(worker=>worker.done)]);
      expect(sql(`select count(*) from public.crm_leads where studio_id='${studio}' and phone='+380501234567';`)).toBe("1");
      expect(sql(`select count(*) from public.meta_lead_jobs where page_id='${page}' and status='skipped' and last_error='duplicate_phone';`)).toBe("1");
    } finally {if(!barrier.child.stdin.writableEnded)barrier.child.stdin.end("rollback;\n");await Promise.allSettled([barrier.done,...workers.map(worker=>worker.done)]);}
  },15000);
  it("waits for an in-flight manual insert then skips the matching Meta lead",async()=>{
    prepare(["3"]);
    const manual=session(`begin;insert into public.crm_leads(studio_id,client_name,phone,first_contact_date) values('${studio}','Manual fixture','+48 503 448 352','2026-11-01');select 'ready';\n`);
    let worker:ReturnType<typeof session>|undefined;
    try {
      await until(()=>manual.output().includes("ready"));
      worker=session(`set application_name='MetaPhoneFixture';set role service_role;${complete("3","0048503448352")}\n`);worker.child.stdin.end();
      await waiters(1);manual.child.stdin.end("commit;\n");await Promise.all([manual.done,worker.done]);
      expect(sql(`select count(*) from public.crm_leads where studio_id='${studio}' and phone in ('+48 503 448 352','0048503448352');`)).toBe("1");
      expect(sql(`select last_error from public.meta_lead_jobs where page_id='${page}' and leadgen_id='3';`)).toBe("duplicate_phone");
    } finally {if(!manual.child.stdin.writableEnded)manual.child.stdin.end("rollback;\n");await Promise.allSettled([manual.done,...(worker ? [worker.done] : [])]);}
  },15000);
});
