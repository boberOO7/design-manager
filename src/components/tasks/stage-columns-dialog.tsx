"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select, SelectItem } from "@/components/ui/select";
import type { StageProgressMethod } from "@/lib/project-progress";
import { BOARD_COLUMNS, type WritableTaskStatus } from "@/lib/tasks";
import type { TaskStage } from "@/lib/task-stages";

export function StageColumnsDialog({ columns, method, onClose, onSaved, projectId, stage }: { columns: WritableTaskStatus[]; method?: StageProgressMethod; onClose: () => void; onSaved: (columns: WritableTaskStatus[], method?: StageProgressMethod) => void; projectId: string; stage: TaskStage }) {
  const status = useTranslations("Status");
  const t = useTranslations("Tasks");
  const locale = useLocale();
  const [selected, setSelected] = useState(columns);
  const [progressMethod, setProgressMethod] = useState<StageProgressMethod>(method ?? "equal");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setError(null);
    const response = await fetch(`/api/projects/${projectId}/stages/${stage}/columns`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled_statuses: selected, ...(method ? { progress_method: progressMethod } : {}) }) });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || result.success !== true) {
      const isBlocked = typeof result === "object" && result !== null && "errorCode" in result && result.errorCode === "tasks_use_disabled_statuses";
      setError(isBlocked ? blockedMessage : saveFailedMessage);
      setSaving(false);
      return;
    }
    onSaved(selected, method ? progressMethod : undefined);
  }
  const configureColumns = locale === "uk" ? "Налаштувати стовпці" : "Configure columns";
  const columnsCount = locale === "uk" ? `${selected.length} з 5 стовпців` : `${selected.length} of 5 columns`;
  const saveFailedMessage = locale === "uk" ? "Не вдалося зберегти налаштування стовпців. Спробуйте ще раз." : "The stage columns could not be saved. Please try again.";
  const blockedMessage = locale === "uk" ? "Спершу перемістіть завдання зі стовпців, які хочете вимкнути." : "Move tasks from the columns you want to disable before saving this stage.";
  const progressMethodLabel = locale === "uk" ? "Метод прогресу" : "Progress method";
  const equalLabel = locale === "uk" ? "Рівний" : "Equal";
  const areaLabel = locale === "uk" ? "За площею" : "Area";
  const weightedLabel = locale === "uk" ? "Зважений" : "Weighted";
  return <Dialog closeDisabled={saving} closeLabel={t("cancel")} isOpen onRequestClose={() => { if (!saving) onClose(); }} title={configureColumns} className="max-w-[25rem]"><div className="overflow-y-auto p-5"><p className="text-sm text-[var(--ui-text-muted)]">{columnsCount}</p>{method ? <label className="mt-4 grid gap-1 text-xs font-medium text-[var(--ui-text-muted)]">{progressMethodLabel}<Select value={progressMethod} disabled={saving} onValueChange={(next) => { if (next === "equal" || next === "area" || next === "weighted") setProgressMethod(next); }}><SelectItem value="equal">{equalLabel}</SelectItem><SelectItem value="area">{areaLabel}</SelectItem><SelectItem value="weighted">{weightedLabel}</SelectItem></Select></label> : null}<div className="mt-4 space-y-2">{BOARD_COLUMNS.map((column) => <label key={column.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-[var(--ui-surface-muted)]"><input type="checkbox" checked={selected.includes(column.status)} onChange={() => setSelected((current) => current.includes(column.status) ? current.length === 1 ? current : current.filter((item) => item !== column.status) : [...current, column.status])} /><span>{status(column.status === "in_progress" ? "inProgress" : column.status)}</span></label>)}</div>{error ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button><Button type="button" onClick={() => void save()} disabled={saving}>{saving ? t("saving") : t("save")}</Button></div></div></Dialog>;
}
