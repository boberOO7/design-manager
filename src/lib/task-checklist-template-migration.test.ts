import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260802140739_create_task_with_checklist_template.sql", import.meta.url);

describe("task checklist template creation migration", () => {
  it("creates a task and its checklist in one security-invoker transaction", async () => {
    const source = await readFile(migrationPath, "utf8");
    expect(source).toContain("create or replace function public.create_task_with_checklist");
    expect(source).toContain("security invoker");
    expect(source).toContain("insert into public.tasks");
    expect(source).toContain("insert into public.task_checklist_items");
    expect(source).toContain("auth.uid()");
    expect(source).not.toContain("p_task ->> 'created_by'");
    expect(source).toContain("jsonb_array_elements(p_checklist_items) with ordinality");
    expect(source).toContain("order by item.ordinality");
    expect(source).toContain("raise exception 'Checklist items must have a title");
  });

  it("keeps the function available only to authenticated callers", async () => {
    const source = await readFile(migrationPath, "utf8");
    expect(source).toContain("revoke execute on function public.create_task_with_checklist(jsonb, jsonb) from public, anon;");
    expect(source).toContain("grant execute on function public.create_task_with_checklist(jsonb, jsonb) to authenticated;");
  });
});
