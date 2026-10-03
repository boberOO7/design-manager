"use client";

import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveStageTasks } from "@/app/(app)/projects/[projectId]/stage-task-actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, inputClassName } from "@/components/ui/form-field";
import { stageTaskEditSchema } from "@/lib/validation/task";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";
import type { TaskStage } from "@/lib/task-stages";
import type { ProjectTask } from "@/types/tasks";

type Draft = {
  key: string;
  taskId: string | null;
  sourceTaskId: string | null;
  title: string;
  area: string;
  templateId: string;
  deleted: boolean;
};

function structure(task: ProjectTask) {
  return { title: task.title, completed_area_m2: task.completed_area_m2, checklist_template_id: task.checklist_template_id };
}

export function StageTaskEditor({ projectId, stage, stageName, tasks, templates, canCreate, onClose, onSaved }: {
  projectId: string;
  stage: TaskStage;
  stageName: string;
  tasks: ProjectTask[];
  templates: StudioChecklistTemplate[];
  canCreate: boolean;
  onClose: () => void;
  onSaved: (tasks: ProjectTask[] | null) => void;
}) {
  const t = useTranslations("StageTaskEditor");
  const tasksT = useTranslations("Tasks");
  const templatesT = useTranslations("Templates");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [originalTasks] = useState(tasks);
  const [rows, setRows] = useState<Draft[]>(() => tasks.map((task) => ({
    key: task.id, taskId: task.id, sourceTaskId: null, title: task.title,
    area: task.completed_area_m2?.toString() ?? "", templateId: task.checklist_template_id ?? "", deleted: false,
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const changed = (row: Draft) => {
    const original = originalTasks.find((task) => task.id === row.taskId);
    return !original || row.deleted || row.title !== original.title
      || row.area !== (original.completed_area_m2?.toString() ?? "") || row.templateId !== (original.checklist_template_id ?? "");
  };
  const dirty = rows.some(changed);
  const deletedCount = rows.filter((row) => row.deleted).length;
  const activeRows = rows.filter((row) => !row.deleted);

  function update(key: string, values: Partial<Draft>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...values } : row));
    setError(null);
    setDiscardPrompt(false);
  }

  function add(source?: Draft) {
    const key = crypto.randomUUID();
    const row: Draft = { key, taskId: null, sourceTaskId: source?.taskId ?? source?.sourceTaskId ?? null,
      title: source?.title ?? "", area: source?.area ?? "", templateId: source?.templateId ?? "", deleted: false };
    setRows((current) => {
      const next = [...current];
      let insertAt = source ? current.findIndex((item) => item.key === source.key) + 1 : current.length;
      if (source && row.sourceTaskId) {
        while (current[insertAt]?.sourceTaskId === row.sourceTaskId) insertAt++;
      }
      next.splice(insertAt, 0, row);
      return next;
    });
    setDiscardPrompt(false);
    requestAnimationFrame(() => {
      const input = document.getElementById(`stage-task-title-${key}`);
      if (input instanceof HTMLInputElement) { input.focus(); input.select(); }
    });
  }

  function nextField(event: KeyboardEvent<HTMLInputElement>, key: string, field: "title" | "area") {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const next = activeRows[activeRows.findIndex((row) => row.key === key) + (event.shiftKey ? -1 : 1)];
    if (next) {
      const input = document.getElementById(`stage-task-${field}-${next.key}`);
      if (input instanceof HTMLInputElement) { input.focus(); input.select(); }
    }
  }

  function close() {
    if (saving) return;
    if (dirty) setDiscardPrompt(true);
    else onClose();
  }

  async function save() {
    if (saving || needsRefresh || !dirty || !formRef.current?.reportValidity()) return;
    const values = (row: Draft) => ({ title: row.title, completed_area_m2: row.area, checklist_template_id: row.templateId || null });
    const parsed = stageTaskEditSchema.safeParse({
      stage,
      updates: rows.flatMap((row) => {
        const original = originalTasks.find((task) => task.id === row.taskId);
        return original && !row.deleted && changed(row) ? [{ id: original.id, ...values(row), previous: structure(original) }] : [];
      }),
      creates: activeRows.filter((row) => !row.taskId).map((row) => ({ ...values(row), client_key: row.key, source_task_id: row.sourceTaskId })),
      delete_ids: rows.filter((row) => row.deleted && row.taskId).map((row) => row.taskId),
      order: activeRows.map((row) => row.taskId ?? row.key),
    });
    if (!parsed.success) { setError(t("invalid")); return; }
    if (parsed.data.creates.some((row) => templates.some((template) => template.id === row.checklist_template_id && template.archivedAt))) {
      setError(t("archivedTemplate")); return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveStageTasks(projectId, parsed.data);
      if (!result.success) {
        setError(t(result.error));
        setNeedsRefresh(result.error === "connectionLost");
        setSaving(false);
        return;
      }
      onSaved(result.tasks);
      router.refresh();
    } catch {
      // A lost response may follow a committed write. Refresh before retrying creates.
      setError(t("connectionLost"));
      setNeedsRefresh(true);
      setSaving(false);
    }
  }

  return <Dialog title={t("title")} description={stageName} closeLabel={t("close")} closeDisabled={saving} isOpen onRequestClose={close} className="max-w-[64rem]">
    <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
        <p className="mb-3 text-xs text-[var(--ui-text-muted)]">{t("help")}</p>
        <div className="hidden grid-cols-[minmax(12rem,1fr)_7rem_minmax(12rem,1fr)_5rem] gap-2 pb-2 text-xs font-medium text-[var(--ui-text-muted)] sm:grid" aria-hidden="true">
          <span>{t("name")}</span><span>{t("area")}</span><span>{templatesT("checklistTemplate")}</span><span />
        </div>
        <ul className="divide-y divide-[var(--ui-border-subtle)]">
          {rows.map((row, index) => {
            const original = originalTasks.find((task) => task.id === row.taskId);
            const canChangeChecklist = !original || original.status === "todo" || original.status === "in_progress";
            return <li key={row.key} data-stage-task-row className="py-2">
              {row.deleted ? <div className="flex min-h-10 items-center justify-between gap-3 text-sm">
                <span className="truncate text-[var(--ui-danger-text)]"><span className="line-through">{row.title}</span> · {t("pendingDelete")}</span>
                <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={saving} onClick={() => update(row.key, { deleted: false })}><RotateCcw className="size-4" />{t("undo")}</Button>
              </div> : <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-2 sm:grid-cols-[minmax(12rem,1fr)_7rem_minmax(12rem,1fr)_5rem]">
                <label className="min-w-0"><span className="sr-only">{t("nameRow", { row: index + 1 })}</span><Input id={`stage-task-title-${row.key}`} data-dialog-initial-focus={index === 0 ? true : undefined} autoComplete="off" required maxLength={200} value={row.title} disabled={saving} onChange={(event) => update(row.key, { title: event.target.value })} onKeyDown={(event) => nextField(event, row.key, "title")} className="h-10" /></label>
                <label><span className="sr-only">{t("areaRow", { row: index + 1 })}</span><Input id={`stage-task-area-${row.key}`} autoComplete="off" type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" placeholder={tasksT("areaUnit")} value={row.area} disabled={saving} onChange={(event) => update(row.key, { area: event.target.value })} onKeyDown={(event) => nextField(event, row.key, "area")} className="h-10 ui-numeric" /></label>
                <label className="min-w-0" title={canChangeChecklist ? undefined : t("checklistLocked")}><span className="sr-only">{t("checklistRow", { row: index + 1 })}</span>
                  <select className={`${inputClassName} h-10 pr-6`} value={row.templateId} disabled={saving || !canChangeChecklist} onChange={(event) => update(row.key, { templateId: event.target.value })}>
                    <option value="">{templatesT("noChecklistTemplate")}</option>
                    {templates.filter((template) => !template.archivedAt || template.id === row.templateId).map((template) => <option key={template.id} value={template.id} disabled={Boolean(template.archivedAt)}>{template.name}</option>)}
                  </select>
                </label>
                <div className="flex items-center justify-end">
                  <Button type="button" variant="ghost" aria-label={t("duplicateRow", { row: index + 1 })} title={t("duplicate")} className="size-10 shrink-0 p-0" disabled={saving || !canCreate} onClick={() => add(row)}><Copy className="size-4" /></Button>
                  <Button type="button" variant="ghost" aria-label={t("deleteRow", { row: index + 1 })} title={tasksT("deleteTask")} disabled={saving} onClick={() => row.taskId ? update(row.key, { deleted: true }) : setRows((current) => current.filter((item) => item.key !== row.key))} className="size-10 shrink-0 p-0 text-[var(--ui-danger-text)]"><Trash2 className="size-4" /></Button>
                </div>
              </div>}
            </li>;
          })}
        </ul>
        {!rows.length ? <p className="py-6 text-center text-sm text-[var(--ui-text-muted)]">{tasksT("noTasks")}</p> : null}
        <Button type="button" variant="outline" size="sm" disabled={saving || !canCreate} onClick={() => add()} className="mt-3 gap-1.5"><Plus className="size-4" />{tasksT("addTask")}</Button>
        {!canCreate ? <p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("creationUnavailable")}</p> : null}
      </div>
      <footer className="shrink-0 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6">
        {deletedCount > 0 ? <p className="mb-3 text-sm text-[var(--ui-danger-text)]">{t("deleteSummary", { count: deletedCount })}</p> : null}
        {error ? <p role="alert" className="mb-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
        {discardPrompt ? <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--ui-text-secondary)]"><p>{tasksT("unsavedChanges")}</p><Button type="button" variant="ghost" onClick={onClose}>{tasksT("discardChanges")}</Button></div> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={close}>{tasksT("cancel")}</Button>{needsRefresh ? <Button type="button" onClick={() => { onClose(); router.refresh(); }}>{t("refresh")}</Button> : <Button type="submit" disabled={saving || !dirty}>{saving ? tasksT("saving") : tasksT("saveChanges")}</Button>}</div>
      </footer>
    </form>
  </Dialog>;
}
