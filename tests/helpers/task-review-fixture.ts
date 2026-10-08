import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/types/database.types";

const localSchema = z.object({ API_URL: z.url(), PUBLISHABLE_KEY: z.string(), SERVICE_ROLE_KEY: z.string() });
export function reviewSql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: statement, encoding: "utf8" }).trim();
}
export function sqlId(value: string) { return `'${z.uuid().parse(value)}'::uuid`; }

export async function createTaskReviewFixture() {
  const local = localSchema.parse(JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, DO_NOT_TRACK: "1" },
  })));
  if (!["localhost", "127.0.0.1"].includes(new URL(local.API_URL).hostname)) throw new Error("Review fixtures require local Supabase");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient<Database>(local.API_URL, local.SERVICE_ROLE_KEY, options);
  const studioId = randomUUID(), projectId = randomUUID(), taskId = randomUUID(), fallbackTaskId = randomUUID();
  const accounts: Array<{ id: string; email: string; password: string; name: string; client: ReturnType<typeof createClient<Database>> }> = [];
  async function dispose() {
    reviewSql(`delete from public.review_timer_buckets where studio_id=${sqlId(studioId)};
      delete from public.review_timer_daily where studio_id=${sqlId(studioId)};
      delete from public.review_timer_sessions where studio_id=${sqlId(studioId)};
      delete from public.work_log_entries where studio_id=${sqlId(studioId)};
      delete from public.work_log_days where studio_id=${sqlId(studioId)};
      delete from public.project_activity where studio_id=${sqlId(studioId)};
      delete from public.tasks where project_id=${sqlId(projectId)};
      delete from public.project_members where project_id=${sqlId(projectId)};
      delete from public.projects where id=${sqlId(projectId)};
      delete from public.studios where id=${sqlId(studioId)};`);
    for (const account of accounts) await service.auth.admin.deleteUser(account.id);
  }
  try {
    await service.from("studios").insert({ id: studioId, name: "Review rounds test studio" }).throwOnError();
    for (const name of ["Admin", "Assignee", "Reviewer", "Outsider"] as const) {
      const email = `review-${name.toLowerCase()}-${randomUUID()}@example.test`, password = `Ui-${randomUUID()}`;
      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      const id = data.user.id, role = name === "Admin" ? "admin" : "employee";
      const client = createClient<Database>(local.API_URL, local.PUBLISHABLE_KEY, options);
      accounts.push({ id, email, password, client, name });
      await service.from("profiles").upsert({ id, email, full_name: `Review ${name}`, system_role: role, is_active: true }).throwOnError();
      await service.from("studio_members").insert({ studio_id: studioId, user_id: id, system_role: role, is_active: true }).throwOnError();
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error) throw signedIn.error;
    }
    const [admin, assignee, reviewer, outsider] = accounts;
    if (!admin || !assignee || !reviewer || !outsider) throw new Error("Missing review test accounts");
    reviewSql(`insert into public.projects(id,studio_id,name,project_type,status,total_area_m2,start_date,created_by)
      values (${sqlId(projectId)},${sqlId(studioId)},'Review rounds project','private','active',0,current_date,${sqlId(admin.id)});
      insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at) values
      (${sqlId(projectId)},${sqlId(assignee.id)},'designer',0,current_date), (${sqlId(projectId)},${sqlId(reviewer.id)},'designer',0,current_date);
      insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,created_by) values
      (${sqlId(taskId)},${sqlId(projectId)},'Review lifecycle task','stage_1','in_progress','high',${sqlId(assignee.id)},${sqlId(admin.id)}),
      (${sqlId(fallbackTaskId)},${sqlId(projectId)},'Review without client step','stage_2','in_progress','normal',${sqlId(assignee.id)},${sqlId(admin.id)});
      update public.project_task_stage_columns set enabled_statuses=array['todo','in_progress','internal_review','completed'] where project_id=${sqlId(projectId)} and stage='stage_2';`);
    async function createAuthenticatedClient(account: typeof admin) {
      const client = createClient<Database>(local.API_URL, local.PUBLISHABLE_KEY, options);
      const signedIn = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      if (signedIn.error) throw signedIn.error;
      return client;
    }
    return { studioId, projectId, taskId, fallbackTaskId, admin, assignee, reviewer, outsider, service, dispose, createAuthenticatedClient };
  } catch (error) { await dispose(); throw error; }
}
export type TaskReviewFixture = Awaited<ReturnType<typeof createTaskReviewFixture>>;
