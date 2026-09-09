import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260909113540_link_crm_leads_to_projects.sql", import.meta.url);
const actionPath = new URL("../app/(app)/projects/new/actions.ts", import.meta.url);

describe("CRM Lead to Project conversion migration", () => {
  it("adds a studio-safe one-to-one project relationship", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("foreign key (project_id, studio_id) references public.projects(id, studio_id)");
    expect(sql).toContain("crm_leads_project_id_key unique (project_id)");
    expect(sql).not.toContain("grant update (project_id)");
  });

  it("extends the existing project RPC and locks the Lead before conversion", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("create or replace function public.create_project_from_template");
    expect(sql).toContain("source_lead_id := nullif(p_project->>'source_lead_id', '')::uuid");
    expect(sql).toContain("for update;");
    expect(sql).toContain("source_project_id is not null");
    expect(sql).toContain("source_lead_status = 'lost'");
    expect(sql).toContain("set project_id = new_project_id,\n        status = 'won'");
  });

  it("records the project link alongside the normal status trigger history", async () => {
    const [sql, action] = await Promise.all([readFile(migrationPath, "utf8"), readFile(actionPath, "utf8")]);
    expect(sql).toContain("'project_linked'");
    expect(sql).toContain("set project_id = new_project_id");
    expect(sql).toContain("insert into public.crm_lead_history");
    expect(action).toContain("createProjectFromLead");
    expect(action).toContain("source_lead_id: sourceLeadId");
    expect(action).toContain('revalidatePath("/crm/leads")');
  });
});
