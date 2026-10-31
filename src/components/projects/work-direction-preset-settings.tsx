"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveDirectionPreset } from "@/app/(app)/projects/[projectId]/direction-actions";
import { directionKindSchema, directionPresetInputSchema, type DirectionKind, type DirectionPreset } from "@/lib/work-directions";
import { templateStageProgressMethodsSchema } from "@/lib/project-templates";
import { TemplateStageProgressFields } from "./template-stage-progress-fields";
import type { ProjectTemplate } from "@/lib/project-templates";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import styles from "./work-directions.module.css";

export function WorkDirectionPresetSettings({ presets, templates }: { presets: DirectionPreset[]; templates: ProjectTemplate[] }) {
  const t = useTranslations("ProjectWorkspace.directions");
  const [kind, setKind] = useState<DirectionKind>("interior");
  return <section className="max-w-3xl rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5">
    <h2 className="text-base font-semibold">{t("presetSettings")}</h2><p className="mb-4 mt-1 text-sm leading-5 text-[var(--ui-text-secondary)]">{t("presetDescription")}</p>
    <div className={styles.presets}>{directionKindSchema.options.map(value => <button key={value} type="button" aria-pressed={kind === value} className={styles.preset} onClick={() => setKind(value)}>{t(`kinds.${value}`)}</button>)}</div>
    <PresetForm key={kind} kind={kind} preset={presets.find(preset => preset.kind === kind)} templates={templates}/>
  </section>;
}

function PresetForm({ kind, preset, templates }: { kind: DirectionKind; preset?: DirectionPreset; templates: ProjectTemplate[] }) {
  const t = useTranslations("ProjectWorkspace.directions"), router = useRouter();
  const [stageProgressMethods, setStageProgressMethods] = useState(() => templateStageProgressMethodsSchema.parse(preset?.stage_progress_methods ?? {}));
  const [coefficient, setCoefficient] = useState(String(preset?.coefficient ?? 1));
  const [min, setMin] = useState(String(preset?.recommended_min ?? "")), [max, setMax] = useState(String(preset?.recommended_max ?? ""));
  const [template, setTemplate] = useState(templates.find(template => template.id === preset?.template_id)?.id ?? ""), [message, setMessage] = useState<string | null>(null), [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = directionPresetInputSchema.safeParse({ kind, stageProgressMethods, coefficient: Number(coefficient), recommendedMin: min === "" ? null : Number(min), recommendedMax: max === "" ? null : Number(max), templateId: template || null, version: preset?.version ?? 0 });
    if (!parsed.success) { setMessage("presetInvalid"); return; }
    setMessage(null);
    startTransition(async () => {
      const result = await saveDirectionPreset(parsed.data).catch(() => ({ success: false, error: "saveFailed" } as const));
      setMessage(result.success ? "presetSaved" : result.error); if (result.success) router.refresh();
    });
  }
  return <form onSubmit={submit} className="mt-5 space-y-4">
    <div className="grid grid-cols-3 gap-3"><FormField label={t("presetCoefficient")}><Input aria-label={t("presetCoefficient")} type="number" inputMode="decimal" step="any" min="0" required value={coefficient} disabled={pending} onChange={event => setCoefficient(event.target.value)}/></FormField><FormField label={t("rangeMin")}><Input aria-label={t("rangeMin")} type="number" inputMode="decimal" step="any" min="0" value={min} disabled={pending} onChange={event => setMin(event.target.value)} placeholder="—"/></FormField><FormField label={t("rangeMax")}><Input aria-label={t("rangeMax")} type="number" inputMode="decimal" step="any" min="0" value={max} disabled={pending} onChange={event => setMax(event.target.value)} placeholder="—"/></FormField></div>
    <FormField as="div" label={t("template")}><Select aria-label={t("template")} value={template} onValueChange={setTemplate} disabled={pending}><SelectItem value="">{t("withoutTemplate")}</SelectItem>{templates.map(template => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</Select></FormField>
    <TemplateStageProgressFields methods={stageProgressMethods} onChange={setStageProgressMethods} disabled={pending}/>
    <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("presetHelp")}</p>
    <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="compact" disabled={pending}>{t(pending ? "saving" : "save")}</Button>{message ? <p role="status" className={`text-xs ${message === "presetSaved" ? "text-[var(--ui-text-secondary)]" : "text-[var(--ui-danger-text)]"}`}>{t(message)}</p> : null}</div>
  </form>;
}
