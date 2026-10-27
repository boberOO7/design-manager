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
const payload = (remove = false) => `(select jsonb_agg(jsonb_build_object('stage',s.stage,'display_name',coalesce(s.display_name,s.stage),'is_enabled',s.is_enabled,'display_order',s.position,'kind',s.kind,'progress_weight',s.progress_weight)) from (select s.*,row_number() over(order by display_order,stage) as position from public.project_task_stage_columns s where project_id=${id(project)} and deleted_at is null ${remove ? "and stage<>'stage_2'" : ""}) s)`;
const save = (version: number, remove = false) => `select public.update_project_stage_configuration(${id(project)},${payload(remove)},true,true,${version},${remove ? `array[${id(task)}]` : "'{}'::uuid[]"});`;

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
    insert into public.studios(id,name) values(${id(studio)},'Stage concurrency');
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(${id(admin)},'authenticated','authenticated','${admin}@stages.test','{}','{}',now(),now());
    insert into public.profiles(id,full_name,email,system_role) values(${id(admin)},'Stage admin','${admin}@stages.test','admin');
    insert into public.studio_members(studio_id,user_id,system_role) values(${id(studio)},${id(admin)},'admin');
    select set_config('request.jwt.claim.sub','${admin}',true);
    insert into public.projects(id,studio_id,name,total_area_m2,status,start_date,created_by) values(${id(project)},${id(studio)},'Concurrency project',100,'planned',current_date,${id(admin)});
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values(${id(project)},${id(admin)},'designer',0,current_date);
    insert into public.tasks(id,project_id,title,stage,status,created_by) values(${id(task)},${id(project)},'Unstarted task','stage_2','todo',${id(admin)});
    commit;`);
});
afterEach(() => {
  if (!studio) return;
  sql(`begin; delete from public.project_members where project_id=${id(project)}; delete from public.projects where id=${id(project)}; delete from public.notifications where studio_id=${id(studio)};
    delete from public.project_activity where studio_id=${id(studio)}; set local session_replication_role=replica;
    delete from private.finance_labor_membership_events where studio_id=${id(studio)};
    set local session_replication_role=origin;
    delete from public.studio_members where studio_id=${id(studio)};
    delete from public.studios where id=${id(studio)}; delete from public.profiles where id=${id(admin)}; delete from auth.users where id=${id(admin)}; commit;`);
});

describe.sequential("project stage configuration concurrency", () => {
  it("preserves a task whose status changes before deletion obtains its locks", async () => {
    const changing = await transactionHolding(`update public.tasks set status='in_progress' where id=${id(task)};`);
    try { expect(() => sql(`${actor()} ${save(0, true)}`)).toThrow(/stage_started_tasks/); }
    finally { await changing.done; }
    expect(sql(`select status from public.tasks where id=${id(task)}`)).toBe("in_progress");
  });

  it("rejects a task inserted after stage deletion wins the project lock", async () => {
    const deleting = await transactionHolding(save(0, true));
    try {
      expect(() => sql(`${actor()} insert into public.tasks(project_id,title,stage,status,created_by) values(${id(project)},'Late task','stage_2','todo',${id(admin)});`)).toThrow(/Choose an existing project stage/);
    } finally { await deleting.done; }
    expect(sql(`select count(*) from public.tasks where project_id=${id(project)}`)).toBe("0");
    expect(sql(`select deleted_at is not null from public.project_task_stage_columns where project_id=${id(project)} and stage='stage_2'`)).toBe("t");
  });

  it("allows only one writer with the same configuration version", async () => {
    const saving = await transactionHolding(save(0));
    try { expect(() => sql(`${actor()} ${save(0)}`)).toThrow(/stage_version_conflict/); }
    finally { await saving.done; }
    expect(sql(`select stage_configuration_version from public.projects where id=${id(project)}`)).toBe("1");
  });
});
