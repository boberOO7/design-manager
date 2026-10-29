"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { saveProjectDirection } from "@/app/(app)/projects/[projectId]/direction-actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/form-field";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectItem } from "@/components/ui/select";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { directionKindSchema, directionName, workDirectionInputSchema, type DirectionKind, type DirectionPreset, type ProjectWorkDirection } from "@/lib/work-directions";
import styles from "./work-directions.module.css";
import type { ProjectTemplate } from "@/lib/project-templates";
import { WorkDirectionCalculator } from "./work-direction-calculator";
import { getKyivDateOnly } from "@/lib/validation/project";
import { WorkDirectionIcon } from "./work-direction-icon";
import { useProjectWorkspaceNavigation } from "./project-workspace-navigation";

export function WorkDirectionEditor({ projectId, version, direction, templates, presets = [], onClose, onSaved }: {
  projectId: string; version: number; direction?: ProjectWorkDirection; templates: ProjectTemplate[]; presets?: DirectionPreset[]; onClose: () => void; onSaved: (id: string) => void;
}) {
  const t = useTranslations("ProjectWorkspace.directions"), locale = useLocale();
  const navigation = useProjectWorkspaceNavigation();
  const initialKind = direction ? directionKindSchema.nullable().parse(direction.kind) : "interior";
  const [kind, setKind] = useState<DirectionKind | null>(initialKind);
  const initialPreset = presets.find(preset => preset.kind === initialKind);
  const [name, setName] = useState(direction ? directionName(direction, t) : t("kinds.interior"));
  const [area, setArea] = useState(String(direction?.area_m2 ?? "")), [coefficient, setCoefficient] = useState(String(direction?.complexity_coefficient ?? initialPreset?.coefficient ?? 1));
  const [startDate, setStartDate] = useState(direction?.start_date ?? getKyivDateOnly()), [dueDate, setDueDate] = useState(direction?.due_date ?? "");
  const [templateId, setTemplateId] = useState(templates.find(template => template.id === initialPreset?.template_id)?.id ?? ""), [error, setError] = useState<string | null>(null), [saving, startSaving] = useTransition();
  const [edited, setEdited] = useState({ name: false, coefficient: false, template: false });
  const preset = presets.find(preset => preset.kind === kind);
  function applyPreset(nextKind: DirectionKind) {
    setKind(nextKind);
    if (direction) { if (direction.name === null && !edited.name) setName(t(`kinds.${nextKind}`)); return; }
    const next = presets.find(preset => preset.kind === nextKind);
    if (!edited.name) setName(t(`kinds.${nextKind}`));
    if (!edited.coefficient) setCoefficient(String(next?.coefficient ?? 1));
    if (!edited.template) setTemplateId(templates.some(template => template.id === next?.template_id) ? next?.template_id ?? "" : "");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = workDirectionInputSchema.safeParse({ intent: "save", id: direction?.id, kind, name, useDefaultName: !edited.name && (!direction || direction.name === null), areaM2: Number(area), coefficient: Number(coefficient), startDate, dueDate, templateId });
    if (!parsed.success) { setError(t("invalid")); return; }
    setError(null);
    startSaving(async () => {
      const result = await saveProjectDirection(projectId, version, parsed.data).catch(() => ({ success: false, error: "failed" } as const));
      if (!result.success) { setError(t(result.error === "conflict" ? "conflict" : result.error === "readOnly" ? "readOnly" : result.error === "areaAllocated" ? "areaAllocated" : "saveFailed")); return; }
      onSaved(result.id);
      if (direction) navigation?.refresh();
    });
  }
  return <Dialog isOpen title={t(direction ? "edit" : "add")} closeLabel={t("close")} closeDisabled={saving} onRequestClose={onClose} className="h-auto max-h-[calc(100dvh-1rem)] max-w-[35rem]">
    <form onSubmit={submit} className="flex min-h-0 flex-col">
      <div className="min-h-0 space-y-4 overflow-y-auto [scrollbar-gutter:stable] px-4 py-4 sm:px-5">
        <div role="radiogroup" aria-label={t("kind")} className={styles.presets} onKeyDown={event => {
          const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
          if (!keys.includes(event.key) || saving) return;
          event.preventDefault();
          const values = directionKindSchema.options, current = Math.max(0, values.findIndex(value => value === kind));
          const next = event.key === "Home" ? 0 : event.key === "End" ? values.length - 1 : (current + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + values.length) % values.length;
          applyPreset(values[next]); event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        }}>
          {directionKindSchema.options.map(value => <button key={value} role="radio" aria-checked={kind === value} tabIndex={kind === value || (!kind && value === "interior") ? 0 : -1} type="button" disabled={saving} className={`${styles.preset} ${styles.presetWithIcon}`} onClick={() => applyPreset(value)}><WorkDirectionIcon kind={value} className="size-5 shrink-0"/><span>{t(`kinds.${value}`)}</span></button>)}
        </div>
        {direction && !kind ? <p className="text-xs text-[var(--ui-text-muted)]">{t("unknownKind")}</p> : null}
        <FormField label={t("name")}><Input data-dialog-initial-focus name="directionName" value={name} required maxLength={80} onChange={event => { setName(event.target.value); setEdited(current => ({ ...current, name: true })); }} disabled={saving} placeholder={t("namePlaceholder")}/></FormField>
        <WorkDirectionCalculator area={area} coefficient={coefficient} onAreaChange={setArea} onCoefficientChange={value => { setCoefficient(value); setEdited(current => ({ ...current, coefficient: true })); }} recommendedMin={preset?.recommended_min} recommendedMax={preset?.recommended_max} disabled={saving} onResetCoefficient={preset || !direction ? () => { setCoefficient(String(preset?.coefficient ?? 1)); setEdited(current => ({ ...current, coefficient: false })); } : undefined} resetDisabled={Number(coefficient) === (preset?.coefficient ?? 1)}/>
        {!direction ? <FormField as="div" label={t("template")}><Select aria-label={t("template")} value={templateId} onValueChange={value => { setTemplateId(value); setEdited(current => ({ ...current, template: true })); }} disabled={saving}><SelectItem value="">{t("withoutTemplate")}</SelectItem>{templates.filter(template => template.isActive).map(template => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</Select></FormField> : <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("historyHelpShort")}</p>}
        <AnimatedDisclosure title={t("schedule")}>
          <div className="space-y-3 pb-1 pt-1">
            <div className="grid grid-cols-2 gap-3"><FormField as="div" label={t("startDate")}><DatePicker aria-label={t("startDate")} locale={locale} value={startDate} onValueChange={setStartDate} disabled={saving}/></FormField><FormField as="div" label={t("dueDate")}><DatePicker aria-label={t("dueDate")} locale={locale} value={dueDate} min={startDate || undefined} onValueChange={setDueDate} disabled={saving}/></FormField></div>
          </div>
        </AnimatedDisclosure>
        {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3 sm:px-5">
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>{t("cancel")}</Button><Button type="submit" disabled={saving}>{saving ? t("saving") : t("save")}</Button>
      </footer>
    </form>
  </Dialog>;
}
