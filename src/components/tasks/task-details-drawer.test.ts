import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

const drawerPath = new URL("./task-details-drawer.tsx", import.meta.url);
const collaboratorControlPath = new URL("./task-collaborator-multi-select.tsx", import.meta.url);
const deadlineEditorPath = new URL("./task-deadline-editor.tsx", import.meta.url);

describe("task details drawer contract", () => {
  it("connects the visible eyebrow, dialog title, and close label to canonical messages", async () => {
    const source = await readFile(drawerPath, "utf8");

    expect(source).toContain('title={t("taskDetails")}');
    expect(source).toContain('{t("taskDetails")}</p>');
    expect(source).toContain('aria-label={t("closeTaskDetails")}');
    expect(source).toContain("isOpen={isOpen}");
    expect(source).toContain("onExited={onExited}");
    expect(source).not.toContain("const [isDrawerOpen");
    expect(source).not.toContain(">TASK DETAILS<");
    expect(en.Tasks.taskDetails).toBe("Task details");
    expect(uk.Tasks.taskDetails).toBe("Деталі завдання");
  });

  it("keeps checklist configuration in the existing edit flow", async () => {
    const source = await readFile(drawerPath, "utf8");
    const editChecklistSection = source.slice(source.indexOf('aria-labelledby="task-edit-checklist"'), source.indexOf(') : ('));
    const detailsChecklistSection = source.slice(source.indexOf('aria-labelledby="task-checklist-heading"'), source.indexOf('{task.description?.trim()'));

    expect(editChecklistSection).toContain("<form onSubmit=");
    expect(editChecklistSection).toContain("checklistTitleRef");
    expect(editChecklistSection).toContain('step="1"');
    expect(detailsChecklistSection).not.toContain("<form onSubmit=");
    expect(detailsChecklistSection).not.toContain('checklistT("empty")');
    expect(detailsChecklistSection).toContain('t("checklistProgress"');
  });

  it("keeps checklist execution compact and read-only in details", async () => {
    const source = await readFile(drawerPath, "utf8");
    const itemRow = source.slice(source.indexOf("function ChecklistItemRow"), source.indexOf("function ChecklistItemEditorRow"));

    expect(itemRow).toContain('type="checkbox"');
    expect(itemRow).toContain("canToggle");
    expect(itemRow).not.toContain('type="number"');
    expect(itemRow).not.toContain('Trash2');
    expect(itemRow).toContain('t("savingItem")');
  });

  it("puts the authorized edit action in the header and removes the read-view footer action", async () => {
    const source = await readFile(drawerPath, "utf8");
    const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"));

    expect(header).toContain("Pencil");
    expect(header).toContain('canEdit && !isEditing');
    expect(header).toContain('aria-label={t("editTask")}');
    expect(header).toContain('title={t("editTask")}');
    expect(source).toContain('canEdit && isEditing ? <footer');
    expect(source).not.toContain(': <Button type="button" onClick={() => setIsEditing(true)}');
    expect(en.Tasks.editTask).toBe("Edit task");
    expect(uk.Tasks.editTask).toBe("Редагувати завдання");
  });

  it("keeps one dominant overall progress bar and reveals manual production on demand", async () => {
    const source = await readFile(drawerPath, "utf8");
    const detailsView = source.slice(source.indexOf(') : (\n            <div className="space-y-6">'), source.indexOf('<section className="border-t border-[var(--ui-border-subtle)] pt-5">'));

    expect(detailsView).toContain('role="progressbar"');
    expect(detailsView).toContain('isEditingManualProgress');
    expect(detailsView).toContain('t("change")');
    expect(detailsView).not.toContain('t("progressExplanation")');
    expect(en.Tasks.change).toBe("Change");
    expect(uk.Tasks.change).toBe("Змінити");
  });

  it("lets administrators clear the assignee and shows an unassigned task safely", async () => {
    const source = await readFile(drawerPath, "utf8");
    expect(source).toContain('value={values.assignee_id ?? ""}');
    expect(source).toContain('assignee_id: assigneeId || null');
    expect(source).toContain('<SelectItem value="">{t("unassigned")}</SelectItem>');
    expect(source).toContain('task.assignee ? <>');
    expect(source).toContain(': t("unassigned")');
  });

  it("keeps co-assignee selection compact and moves options into an accessible popover", async () => {
    const source = await readFile(drawerPath, "utf8");
    const control = await readFile(collaboratorControlPath, "utf8");

    expect(source).toContain("TaskCollaboratorMultiSelect");
    expect(control).toContain("Popover.Trigger");
    expect(control).toContain("Popover.Content");
    expect(control).toContain('type="checkbox"');
    expect(control).toContain('>{t("addCoAssignees")}</span>');
    expect(control).toContain('t("removeCoAssignee"');
    expect(control).toContain("members.filter((member) => member.id !== assigneeId)");
    expect(control).toContain("selectedMembers.slice(0, 2)");
    expect(control).not.toContain("searchCoAssignees");
    expect(control).not.toContain("<Search");
    expect(control).toContain('size="boardCard"');
    expect(en.Tasks.addCoAssignees).toBe("Add co-assignees");
    expect(uk.Tasks.addCoAssignees).toBe("Додати співвиконавців");
  });

  it("keeps deletion in the administrator-only overflow action and requires confirmation", async () => {
    const source = await readFile(drawerPath, "utf8");

    expect(source).toContain('{canManageTasks ? <Popover.Root>');
    expect(source).toContain('aria-label={t("taskActions")}');
    expect(source).toContain('onClick={() => setIsDeleteDialogOpen(true)}');
    expect(source).toContain('<Dialog ariaLabel={t("deleteTask")}');
    expect(source).toContain('onClick={() => void deleteTask()}');
    expect(source).toContain('onTaskDeleted?.(task.id)');
    expect(en.Tasks.deleteTask).toBe("Delete task");
    expect(uk.Tasks.deleteTask).toBe("Видалити завдання");
  });

  it("edits compact milestone deadlines and keeps status changes out of the task edit form", async () => {
    const source = await readFile(drawerPath, "utf8");
    const deadlineEditor = await readFile(deadlineEditorPath, "utf8");
    const editPlanning = source.slice(source.indexOf('aria-labelledby="task-edit-planning"'), source.indexOf('aria-labelledby="task-edit-progress"'));

    expect(editPlanning).toContain("<TaskDeadlineEditor");
    expect(editPlanning).toContain("error={fieldErrors.deadlines}");
    expect(editPlanning).not.toContain('label={t("status")}');
    expect(deadlineEditor).toContain("TASK_MILESTONE_STATUSES.filter");
    expect(deadlineEditor).toContain('t("addDeadline")');
    expect(deadlineEditor).toContain('t("removeDeadline"');
    expect(source).toContain("deadlines: toTaskDeadlineInputs(values.deadlines)");
    expect(deadlineEditor).toContain("getTaskStatusBadgeStyle(deadline.target_status).className");
    expect(source).toContain("TaskDeadlineSummary");
    expect(source).toContain("getTaskDeadlinePresentation");
    expect(source).toContain("<Check aria-hidden=\"true\"");
  });

  it("keeps active deadline rows aligned, grows descriptions, and summarizes collaborators in details", async () => {
    const source = await readFile(drawerPath, "utf8");
    const deadlineSummary = source.slice(source.indexOf("function TaskDeadlineSummary"), source.indexOf("function AutoGrowingTextarea"));
    const taskInformation = source.slice(source.indexOf('{task.description?.trim() ? <section>'), source.indexOf('{!canManageTasks && canUpdateStatus'));

    expect(deadlineSummary).toContain('{isCompleted ? <Check');
    expect(deadlineSummary).not.toContain(': <span aria-hidden="true" className="size-4 shrink-0" />');
    expect(source).toContain("function AutoGrowingTextarea");
    expect(source).toContain('textarea.style.height = "auto"');
    expect(source).toContain("Math.min(textarea.scrollHeight, 240)");
    expect(source).toContain('<AutoGrowingTextarea autoComplete="off"');
    expect(source).toContain("function TaskCollaboratorSummary");
    expect(source).toContain('emptyLabel={t("noCollaborators")}');
    expect(taskInformation).not.toContain('{t("status")}');
    expect(en.Tasks.noCollaborators).toBe("None");
    expect(uk.Tasks.noCollaborators).toBe("Немає");
  });
});
