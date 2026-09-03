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

  it("keeps assignment optional with the localized unassigned option", async () => {
    const source = await readFile(dialogPath, "utf8");
    expect(source).toContain('label={t("assignee")} optional');
    expect(source).toContain('<SelectItem value="">{t("unassigned")}</SelectItem>');
    expect(source).not.toContain('name="assignee_id" required');
    expect(source).not.toContain("disabled={isPending || members.length === 0}");
  });

  it("uses shared collaborator and milestone-deadline controls without a creation status or legacy date", async () => {
    const source = await readFile(dialogPath, "utf8");

    expect(source).toContain("TaskCollaboratorMultiSelect");
    expect(source).toContain('name="collaborator_ids"');
    expect(source).toContain("TaskDeadlineEditor");
    expect(source).toContain('name="deadlines"');
    expect(source).not.toContain('label={t("status")}');
    expect(source).not.toContain('name="status"');
    expect(source).not.toContain('name="due_date"');
    expect(source).not.toContain('t("taskAreaHelp")');
  });
});
