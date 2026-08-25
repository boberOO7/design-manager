import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dashboardPath = new URL("./dashboard.ts", import.meta.url);
const tasksPath = new URL("./tasks.ts", import.meta.url);

describe("paused-project operational query scope", () => {
  it("excludes paused parent projects centrally from every Dashboard task and project result", async () => {
    const source = await readFile(dashboardPath, "utf8");

    expect(source).toContain('import { OPERATIONAL_PROJECT_STATUSES } from "@/lib/project-lifecycle"');
    expect(source).toContain('.in("status", OPERATIONAL_PROJECT_STATUSES)');
    expect(source).toContain('.in("project.status", OPERATIONAL_PROJECT_STATUSES)');
    expect(source).not.toContain('["planned", "active", "paused"]');
  });

  it("excludes paused parent projects from My Tasks at the join query rather than in its UI", async () => {
    const source = await readFile(tasksPath, "utf8");

    expect(source).toContain('.neq("project.status", "paused")');
    expect(source).toContain('.is("project.archived_at", null)');
  });
});
