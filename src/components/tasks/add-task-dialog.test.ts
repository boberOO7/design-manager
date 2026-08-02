import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dialogPath = new URL("./add-task-dialog.tsx", import.meta.url);

describe("task creation checklist template contract", () => {
  it("keeps templates optional and submits only the edited title and weight fields", async () => {
    const source = await readFile(dialogPath, "utf8");
    expect(source).toContain("No checklist template");
    expect(source).toContain('name="checklist_items"');
    expect(source).toContain("checklistItems.map(({ title, weight }) => ({ title, weight }))");
    expect(source).toContain("Remove ${item.title} from checklist template");
  });

  it("guards repeated form submission while the creation action is in flight", async () => {
    const source = await readFile(dialogPath, "utf8");
    expect(source).toContain("hasSubmittedRef.current");
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("else hasSubmittedRef.current = true");
  });
});
