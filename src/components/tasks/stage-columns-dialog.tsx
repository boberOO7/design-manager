"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BOARD_COLUMNS, type WritableTaskStatus } from "@/lib/tasks";
import type { TaskStage } from "@/lib/task-stages";

export function StageColumnsDialog({ columns, onClose, onSaved, projectId, stage }: { columns: WritableTaskStatus[]; onClose: () => void; onSaved: (columns: WritableTaskStatus[]) => void; projectId: string; stage: TaskStage }) {
  const status = useTranslations("Status");
  const t = useTranslations("Tasks");
  const locale = useLocale();
  const [selected, setSelected] = useState(columns);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setError(null);
    const response = await fetch(`/api/projects/${projectId}/stages/${stage}/columns`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled_statuses: selected }) });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || result.success !== true) { setError(typeof result === "object" && result !== null && "formError" in result && typeof result.formError === "string" ? result.formError : t("updateFailed")); setSaving(false); return; }
    onSaved(selected);
  }
  const configureColumns = locale === "uk" ? "Налаштувати стовпці" : "Configure columns";
  const columnsCount = locale === "uk" ? `${selected.length} з 5 стовпців` : `${selected.length} of 5 columns`;
  return <dialog open aria-labelledby="stage-columns-title" className="m-auto w-[min(92vw,25rem)] rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-0 text-[var(--ui-text)] shadow-2xl backdrop:bg-[var(--ui-overlay)]"><div className="p-5"><h2 id="stage-columns-title" className="font-semibold">{configureColumns}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{columnsCount}</p><div className="mt-4 space-y-2">{BOARD_COLUMNS.map((column) => <label key={column.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-[var(--ui-surface-muted)]"><input type="checkbox" checked={selected.includes(column.status)} onChange={() => setSelected((current) => current.includes(column.status) ? current.length === 1 ? current : current.filter((item) => item !== column.status) : [...current, column.status])} /><span>{status(column.status === "in_progress" ? "inProgress" : column.status)}</span></label>)}</div>{error ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>{t("cancel")}</Button><Button type="button" onClick={() => void save()} disabled={saving}>{saving ? t("saving") : t("save")}</Button></div></div></dialog>;
}
