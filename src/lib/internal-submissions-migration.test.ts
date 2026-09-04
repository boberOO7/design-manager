import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260904120000_internal_submissions.sql", "utf8");

describe("internal submissions migration", () => {
  it("stores anonymous complaints without an author identity", () => {
    expect(migration).toContain("case when p_anonymous then null else v_actor end");
    expect(migration).toContain("is_anonymous and type = 'complaint' and author_id is null");
    expect(migration).toContain("case when new.is_anonymous then null else new.author_id end");
  });

  it("protects visibility and the administrator note with RLS", () => {
    expect(migration).toContain("private.can_access_submission");
    expect(migration).toContain("submission_admin_details_select_admin");
    expect(migration).toContain("private.is_studio_admin(studio_id)");
  });

  it("enforces canonical workflows and unique suggestion support", () => {
    expect(migration).toContain("invalid_submission_transition");
    expect(migration).toContain("primary key (submission_id, user_id)");
  });

  it("has no project, task, productivity, area, progress, or rating relation", () => {
    const tableSection = migration.slice(migration.indexOf("create table public.submissions"), migration.indexOf("create table public.submission_admin_details"));
    expect(tableSection).not.toMatch(/project_id|task_id|productivity|area_m2|rating/i);
  });
});
