import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Like the existing SQL integration fixtures, this targets the local container only.
const database = process.env.STUDIOFLOW_TEST_DATABASE ?? "postgres";
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)) throw new Error("Choose a local test database name.");
const args = ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "supabase_admin", "-d", database, "-XAt", "-v", "ON_ERROR_STOP=1"];
const sql = (statement: string) => execFileSync("docker", args, { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const id = (value: string) => `'${value}'::uuid`;
let studio: string, admin: string, project: string, task: string;
const actor = () => `select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated;`;
const save = () => `select public.save_productivity_stage_shares(${id(studio)},30);`;

function transactionHolding(statement: string): Promise<{ done: Promise<string> }> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errorOutput = "", ready = false;
    const done = new Promise<string>((finish, fail) => {
      child.on("error", (error) => { reject(error); fail(error); });
      child.stderr.on("data", (chunk: Buffer) => { errorOutput += chunk.toString(); });
      child.on("exit", (code) => {
        if (code !== 0) { const error = new Error(errorOutput); reject(error); fail(error); }
        else finish(output);
      });
    });
    // Avoid an unhandled rejection if setup fails before the ready marker.
    void done.catch(() => {});
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (!ready && output.includes("stage_lock_ready")) { ready = true; resolve({ done }); }
    });
    child.stdin.end(`begin; ${actor()} ${statement}\n\\echo stage_lock_ready\nselect pg_sleep(0.7); commit;`);
  });
}

beforeEach(() => {
  [studio, admin, project, task] = Array.from({ length: 4 }, () => randomUUID());
  sql(`begin;
    insert into public.studios(id,name) values(${id(studio)},'Productivity shares concurrency');
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(${id(admin)},'authenticated','authenticated','${admin}@stages.test','{}','{}',now(),now());
    insert into public.profiles(id,full_name,email,system_role) values(${id(admin)},'Stage admin','${admin}@stages.test','admin');
    insert into public.studio_members(studio_id,user_id,system_role) values(${id(studio)},${id(admin)},'admin');
    select set_config('request.jwt.claim.sub','${admin}',true);
    insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values(${id(project)},${id(studio)},'Concurrency project',100,'planned',current_date,${id(admin)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values(${id(project)},${id(admin)},'designer',0,current_date);
    insert into public.tasks(id,project_id,title,stage,status,created_by,assignee_id) values(${id(task)},${id(project)},'Unstarted task','stage_1','todo',${id(admin)},${id(admin)});
    insert into public.tasks(project_id,title,stage,status,created_by) values(${id(project)},'Keep project active','stage_2','todo',${id(admin)});
    commit;`);
});
afterEach(() => {
  if (!studio) return;
  sql(`begin; delete from public.tasks where project_id in (select id from public.projects where studio_id=${id(studio)}); delete from public.project_members where project_id in (select id from public.projects where studio_id=${id(studio)}); delete from public.projects where studio_id=${id(studio)}; delete from public.notifications where studio_id=${id(studio)};
    delete from public.project_activity where studio_id=${id(studio)}; set local session_replication_role=replica;
    delete from private.finance_labor_membership_events where studio_id=${id(studio)};
    set local session_replication_role=origin;
    delete from public.studio_members where studio_id=${id(studio)};
    delete from public.studios where id=${id(studio)}; delete from public.profiles where id=${id(admin)}; delete from auth.users where id=${id(admin)}; commit;`);
});

describe.sequential("studio productivity shares concurrency", () => {
  it("rejects a busy project atomically and can be retried after the project lock is released", async () => {
    const changing = await transactionHolding(`reset role; select id from public.projects where id=${id(project)} for update;`);
    try { expect(() => sql(`${actor()} ${save()}`)).toThrow(/could not obtain lock on row in relation "projects"/); }
    finally { await changing.done; }
    expect(sql(`select productivity_stage_1_percent from public.studios where id=${id(studio)}`)).toBe("20");
    sql(`${actor()} ${save()}`);
    expect(Number(sql(`select productivity_budget_m2 from public.project_stage_productivity_budgets where project_id=${id(project)} and stage='stage_1'`))).toBe(30);
  });

  it("uses the new shares when completion waits for a settings save", async () => {
    const saving = await transactionHolding(save());
    try { sql(`${actor()} update public.tasks set status='completed' where id=${id(task)};`); }
    finally { await saving.done; }
    expect(Number(sql(`select credited_area_m2 from public.productivity_attributions where task_id=${id(task)} and voided_at is null`))).toBe(30);
  });

  it("includes a project committed concurrently before the studio lock", async () => {
    const newProject = randomUUID();
    const creating = await transactionHolding(`reset role; insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values(${id(newProject)},${id(studio)},'Concurrent project',100,'planned',current_date,${id(admin)});`);
    try { sql(`${actor()} ${save()}`); }
    finally { await creating.done; }
    expect(Number(sql(`select productivity_budget_m2 from public.project_stage_productivity_budgets where project_id=${id(newProject)} and stage='stage_1'`))).toBe(30);
  });
});
