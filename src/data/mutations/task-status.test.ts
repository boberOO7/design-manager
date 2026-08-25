import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const mutationPath = new URL("./task-status.ts", import.meta.url);

describe("task status mutation contract", () => {
  it("leaves Client review checklist completion to the atomic database transition while keeping Done guarded", async () => {
    const source = await readFile(mutationPath, "utf8");

    expect(source).toContain('if (parsed.data.status === "completed"');
    expect(source).not.toContain('parsed.data.status === "review" || parsed.data.status === "completed"');
    expect(source).toContain("Complete every checklist item before moving this task to Done.");
  });

  it("requires an assignee for productivity-bearing work while retaining the active-member check", async () => {
    const source = await readFile(mutationPath, "utf8");

    expect(source).toContain("canCompleteAttributedTask");
    expect(source).toContain("doesTaskCompletionRequireProductivityAttribution");
    expect(source).toContain("projectAreaM2: authorization.task.project.total_area_m2");
    expect(source).toContain("requiresProductivityAttribution:");
    expect(source).toContain("assigneeId: authorization.task.assignee_id");
    expect(source).toContain("isActiveProjectMember");
    expect(source).toContain('const update: Pick<TaskUpdate, "status"> = { status: parsed.data.status };');
  });
});
