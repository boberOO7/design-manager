import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

const drawerPath = new URL("./task-details-drawer.tsx", import.meta.url);

describe("task checklist drawer contract", () => {
  it("connects the visible eyebrow, dialog title, and close label to canonical messages", async () => {
    const source = await readFile(drawerPath, "utf8");

    expect(source).toContain('title={t("taskDetails")}');
    expect(source).toContain('{t("taskDetails")}</p>');
    expect(source).toContain('aria-label={t("closeTaskDetails")}');
    expect(source).not.toContain(">TASK DETAILS<");
    expect(en.Tasks.taskDetails).toBe("Task details");
    expect(uk.Tasks.taskDetails).toBe("Деталі завдання");
  });

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
    expect(itemRow).toContain('t("itemTitle")');
    expect(itemRow).not.toContain('>Save<');
    expect(itemRow).toContain('t("savingItem")');
    expect(itemRow).toContain('step="1"');
  });
});
