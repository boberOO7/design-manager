import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20260914120425_allow_admin_project_completion_date_edit.sql", import.meta.url);

describe("admin project completion date migration", () => {
  it("allows only an administrator's date-only correction on a completed project", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain("is_completion_date_only_edit");
    expect(sql).toContain("private.is_studio_admin(old.studio_id)");
    expect(sql).toContain("Only administrators may edit project completion dates");
    expect(sql).toContain("Project completion date cannot be in the future");
    expect(sql).toContain("new.status = 'completed'");
    expect(sql).toContain("new.completed_at is not null");
    expect(sql).toContain("to_jsonb(new) - array['completed_at', 'updated_at']");
  });

  it("leaves lifecycle transitions and completion side effects unchanged", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain("if old.status in ('active', 'paused') and new.status = 'completed'");
    expect(sql).toContain("if open_task_count = 0 then new.completed_at := current_date; return new; end if;");
    expect(sql).toContain("if old.status = 'completed' and new.status = 'active' then new.completed_at := null; return new; end if;");
    expect(sql).not.toContain("insert into public.project_activity");
    expect(sql).not.toContain("insert into public.productivity_attributions");
  });
});
