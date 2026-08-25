"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ConfiguredProjectStage } from "@/data/queries/project-stage-columns";
import type { TaskStage } from "@/lib/task-stages";

type DraftStage = ConfiguredProjectStage & { displayName: string };

export function ProjectStageConfigurationDialog({ includeInProductivity, onClose, onSaved, projectId, stages, stageLabels }: { includeInProductivity: boolean; onClose: () => void; onSaved: (stages: ConfiguredProjectStage[], includeInProductivity: boolean) => void; projectId: string; stages: ConfiguredProjectStage[]; stageLabels: (stage: TaskStage) => string }) {
  const t = useTranslations("StageConfiguration");
  const [draft, setDraft] = useState<DraftStage[]>(() => stages.map((stage) => ({ ...stage, displayName: stage.displayName ?? stageLabels(stage.stage) })));
  const [included, setIncluded] = useState(includeInProductivity);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabledCount = draft.filter((stage) => stage.isEnabled).length;
  function move(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= draft.length) return; setDraft((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next.map((stage, position) => ({ ...stage, displayOrder: position + 1 })); }); }
  async function save() {
    if (!draft.some((stage) => stage.isEnabled)) { setError(t("cannotDisableLast")); return; }
    setSaving(true); setError(null);
    const response = await fetch(`/api/projects/${projectId}/stage-configuration`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stages: draft, include_in_productivity: included }) });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || result.success !== true) { const code = typeof result === "object" && result !== null && "errorCode" in result ? result.errorCode : null; setError(code === "active_tasks" ? t("activeTasks") : code === "minimum_stage" ? t("cannotDisableLast") : t("saveFailed")); setSaving(false); return; }
    onSaved(draft.map(({ displayName, ...stage }) => ({ ...stage, displayName })), included);
  }
  return <Dialog closeDisabled={saving} closeLabel={t("cancel")} isOpen onRequestClose={() => { if (!saving) onClose(); }} title={t("title")} className="max-w-[34rem]"><div className="space-y-4 overflow-y-auto p-5"><p className="text-sm leading-5 text-[var(--ui-text-muted)]">{t("description")}</p><div className="space-y-2">{draft.map((stage, index) => <div key={stage.stage} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--ui-border)] p-3"><input aria-label={t("enabled")} checked={stage.isEnabled} disabled={enabledCount === 1 && stage.isEnabled} type="checkbox" onChange={() => setDraft((current) => current.map((item) => item.stage === stage.stage ? { ...item, isEnabled: !item.isEnabled } : item))} /><label className="min-w-0"><span className="sr-only">{t("stageName")}</span><input className="h-9 w-full rounded-md border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2 text-sm text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" value={stage.displayName} onChange={(event) => setDraft((current) => current.map((item) => item.stage === stage.stage ? { ...item, displayName: event.target.value } : item))} /></label><div className="flex"><button aria-label={t("moveUp")} className="rounded p-1.5 disabled:opacity-40" disabled={index === 0} onClick={() => move(index, -1)} type="button"><ArrowUp className="size-4" /></button><button aria-label={t("moveDown")} className="rounded p-1.5 disabled:opacity-40" disabled={index === draft.length - 1} onClick={() => move(index, 1)} type="button"><ArrowDown className="size-4" /></button></div></div>)}</div><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--ui-border)] p-3"><input checked={included} className="mt-0.5" type="checkbox" onChange={(event) => setIncluded(event.target.checked)} /><span><span className="block text-sm font-medium text-[var(--ui-text)]">{t("includeInProductivity")}</span><span className="mt-1 block text-xs leading-5 text-[var(--ui-text-muted)]">{t("includeInProductivityHelp")}</span></span></label>{error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<div className="flex justify-end gap-2"><Button disabled={saving} onClick={onClose} type="button" variant="outline">{t("cancel")}</Button><Button disabled={saving} onClick={() => void save()} type="button">{saving ? t("saving") : t("save")}</Button></div></div></Dialog>;
}
