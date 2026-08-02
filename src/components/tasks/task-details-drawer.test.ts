import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const drawerPath = new URL("./task-details-drawer.tsx", import.meta.url);

describe("task checklist drawer contract", () => {
  it("uses a single checklist form that submits on Enter", async () => {
    const source = await readFile(drawerPath, "utf8");
    const checklistSection = source.slice(source.indexOf('aria-labelledby="task-checklist-heading"'));

    expect(checklistSection).toContain("<form onSubmit=");
    expect(checklistSection).toContain('type="submit"');
    expect(checklistSection).toContain("checklistTitleRef");
    expect(checklistSection).toContain('step="1"');
    expect(checklistSection).toContain('inputMode="numeric"');
  });

  it("keeps checkbox and title in one logical row without a per-item Save button", async () => {
    const source = await readFile(drawerPath, "utf8");
    const itemRow = source.slice(source.indexOf("function ChecklistItemRow"));

    expect(itemRow).toContain('type="checkbox"');
    expect(itemRow).toContain("Checklist title");
    expect(itemRow).not.toContain('>Save<');
    expect(itemRow).toContain("Saving checklist item");
    expect(itemRow).toContain('step="1"');
  });
});
