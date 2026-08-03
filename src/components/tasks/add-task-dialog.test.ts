import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dialogPath = new URL("./add-task-dialog.tsx", import.meta.url);

describe("task creation checklist template contract", () => {
  it("keeps templates optional and submits only the edited title and weight fields", async () => {
    const source = await readFile(dialogPath, "utf8");
    expect(source).toContain('templatesT("noChecklistTemplate")');
    expect(source).toContain('name="checklist_items"');
    expect(source).toContain("checklistItems.map(({ title, weight }) => ({ title, weight }))");
    expect(source).toContain('templatesT("remove", { title: item.title })');
    expect(source).toContain('templatesT("totalWeight", { weight: totalWeight })');
    expect(source).toContain('aria-expanded={isCustomizerOpen}');
    expect(source).toContain('templatesT("customize")');
    expect(source).toContain('templatesT("collapse")');
    expect(source).toContain('templatesT("changingConfirm")');
    expect(source).toContain("sticky bottom-0");
  });

  it("guards repeated form submission while the creation action is in flight", async () => {
    const source = await readFile(dialogPath, "utf8");
    expect(source).toContain("hasSubmittedRef.current");
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("else hasSubmittedRef.current = true");
  });
});
