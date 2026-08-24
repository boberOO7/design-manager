import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const boardPath = new URL("./project-task-board.tsx", import.meta.url);
const dialogPath = new URL("./stage-columns-dialog.tsx", import.meta.url);
const mutationPath = new URL("../../data/mutations/project-stage-columns.ts", import.meta.url);

describe("stage configuration controls", () => {
  it("keeps the columns dialog limited to visible board columns", async () => {
    const source = await readFile(dialogPath, "utf8");

    expect(source).not.toContain("SelectItem");
    expect(source).not.toContain("progress_method");
    expect(source).toContain("JSON.stringify({ enabled_statuses: selected })");
  });

  it("places progress methods in the stage menu and updates only the local method state", async () => {
    const source = await readFile(boardPath, "utf8");

    expect(source).toContain("progressMethodLabel");
    expect(source).toContain('label: "Рівний"');
    expect(source).toContain('label: "За площею"');
    expect(source).toContain('label: "Зважений"');
    expect(source).toContain('JSON.stringify({ progress_method: method })');
    expect(source).toContain("setLocalStageProgressMethods");
    expect(source).toContain("setLocalStageColumns");
    expect(source).toContain('role="menuitemradio"');
  });

  it("allows the existing persistence layer to update columns or a progress method independently", async () => {
    const source = await readFile(mutationPath, "utf8");

    expect(source).toContain("const hasStatuses = statuses !== undefined");
    expect(source).toContain("const hasProgressMethod = progressMethod !== undefined");
    expect(source).toContain("if (hasStatuses) update.enabled_statuses = enabledStatuses");
    expect(source).toContain("if (hasProgressMethod) update.progress_method = progressMethod as StageProgressMethod");
  });
});
