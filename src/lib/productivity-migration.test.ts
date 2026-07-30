import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260730120000_productivity_attribution.sql", import.meta.url);

describe("productivity attribution migration contract", () => {
  it("uses immutable completion events with task and fallback exclusivity", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("completed_area_m2 numeric null check (completed_area_m2 > 0)");
    expect(sql).toContain("source_type in ('task', 'project_fallback')");
    expect(sql).toContain("where project_id = new.id and completed_area_m2 is not null");
    expect(sql).toContain("new.total_area_m2");
    expect(sql).toContain("member.is_active = true");
    expect(sql).toContain("studio_member.is_active = true");
    expect(sql).toContain("profile.is_active = true");
  });

  it("voids current credit on reopen and limits direct reads to authorized studio members", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("set voided_at = now()");
    expect(sql).toContain("productivity_attributions_select_for_active_studio_members");
    expect(sql).toContain("private.is_studio_member(studio_id)");
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("productivity_active_task_attribution");
    expect(sql).toContain("productivity_active_project_contributor_attribution");
  });

  it("keeps attribution history through task and project deletion, with no legacy backfill", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("project_id uuid not null,");
    expect(sql).toContain("task_id uuid,");
    expect(sql).toContain("contributor_id uuid not null,");
    expect(sql).not.toContain("insert into public.productivity_attributions\nselect");
    expect(sql).toContain("Existing completed work is intentionally not backfilled");
  });

  it("has a database guard that matches the application error for inactive attributed assignees", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("Attributed task completion requires an active project-member assignee");
    expect(sql).toContain("member.project_id = new.project_id");
  });
});
