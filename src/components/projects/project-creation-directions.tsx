"use client";

import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Minus, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { AnimatedFormContent, AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ActiveStudioAssignee } from "@/data/queries/project-members";
import { directionKindSchema, equivalentArea, type DirectionPreset } from "@/lib/work-directions";
import { creationDirectionInput, type ProjectCreationDirectionDraft } from "@/lib/project-creation-directions";
import { PROJECT_TEMPLATE_STAGES, getTemplateStageTasks, type ProjectTemplate } from "@/lib/project-templates";
import { formatNumber } from "@/lib/utils";
import { WorkDirectionIcon } from "./work-direction-icon";
import styles from "./project-form.module.css";

export function ProjectCreationDirections({ area, presets, templates, members, templateId, onTemplateChange, stageAssignees, onAssigneeChange, drafts, onDraftsChange, invalidIndex }: {
  area: string; presets: DirectionPreset[]; templates: ProjectTemplate[]; members: ActiveStudioAssignee[];
  templateId: string; onTemplateChange: (id: string) => void; stageAssignees: Record<string, string>; onAssigneeChange: (stage: string, id: string) => void;
  drafts: ProjectCreationDirectionDraft[]; onDraftsChange: (drafts: ProjectCreationDirectionDraft[]) => void; invalidIndex: number | null;
}) {
  const t = useTranslations("ProjectForm"), d = useTranslations("ProjectWorkspace.directions"), locale = useLocale();
  const interior = presets.find(preset => preset.kind === "interior");
  const coefficient = interior?.coefficient ?? 1;
  const activeTemplates = templates.filter(template => template.isActive);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const update = (key: string, patch: Partial<ProjectCreationDirectionDraft>) => onDraftsChange(drafts.map(draft => draft.key === key ? { ...draft, ...patch } : draft));
  return <section className={styles.directions} aria-label={d("title")}>
    <div className={styles.sectionHeading}><h3>{d("title")}</h3><span>{drafts.length + 1}</span></div>
    <input type="hidden" name="directions" value={JSON.stringify(drafts.map(creationDirectionInput))}/>
    <input type="hidden" name="project_template_id" value={templateId}/>
    {PROJECT_TEMPLATE_STAGES.map(stage => <input key={stage} type="hidden" name={`stage_assignee_${stage}`} value={stageAssignees[stage] ?? ""}/>)}
    <div className={styles.directionCard} data-creation-direction="interior">
      <div className={styles.directionHeader}><WorkDirectionIcon kind="interior" className="size-5 shrink-0"/><div className="min-w-0 flex-1"><h4>{d("kinds.interior")}</h4><p className={styles.directionCaption}>{t("firstDirection")}</p></div><span className={styles.areaPreview}>{Number(area) > 0 ? formatNumber(Number(area), locale) : "—"} <small>м²</small></span></div>
      <TemplateField value={templateId} templates={activeTemplates} onChange={onTemplateChange} initial/>
      <div className={styles.equivalent}><span>{d("coefficient")}: {formatNumber(coefficient, locale)}</span><span>{d("equivalent")}: <strong>{equivalentArea(Number(area), coefficient) === null ? "—" : formatNumber(Number(area) * coefficient, locale)} {d("unitShort")}</strong></span></div>
      {templateId ? <TemplateAssignments template={activeTemplates.find(template => template.id === templateId)} members={members} values={stageAssignees} onChange={onAssigneeChange}/> : null}
    </div>
    {drafts.map((draft, index) => <DraftDirection key={draft.key} draft={draft} templates={activeTemplates} open={expandedKey === draft.key || invalidIndex === index} invalid={invalidIndex === index} onToggle={() => setExpandedKey(expandedKey === draft.key ? null : draft.key)} onChange={patch => update(draft.key, patch)} onRemove={() => onDraftsChange(drafts.filter(item => item.key !== draft.key))}/>)}
    <Select aria-label={d("addShort")} placeholder={<span className="inline-flex items-center gap-2"><Plus aria-hidden="true" className="size-4"/>{d("addShort")}</span>} value="" onValueChange={value => {
      const parsed = directionKindSchema.safeParse(value);
      if (!parsed.success) return;
      const kind = parsed.data, preset = presets.find(item => item.kind === kind), key = crypto.randomUUID();
      onDraftsChange([...drafts, { key, kind, name: d(`kinds.${kind}`), nameEdited: false, area: "", coefficient: String(preset?.coefficient ?? 1), templateId: activeTemplates.find(template => template.id === preset?.template_id)?.id ?? "" }]);
      setExpandedKey(key);
    }}>
      {directionKindSchema.options.map(kind => <SelectItem key={kind} value={kind} textValue={d(`kinds.${kind}`)}><span className="inline-flex items-center gap-2"><WorkDirectionIcon kind={kind} className="size-4"/>{d(`kinds.${kind}`)}</span></SelectItem>)}
    </Select>
  </section>;
}

function DraftDirection({ draft, templates, open, invalid, onToggle, onChange, onRemove }: { draft: ProjectCreationDirectionDraft; templates: ProjectTemplate[]; open: boolean; invalid: boolean; onToggle: () => void; onChange: (patch: Partial<ProjectCreationDirectionDraft>) => void; onRemove: () => void }) {
  const d = useTranslations("ProjectWorkspace.directions"), t = useTranslations("ProjectForm"), locale = useLocale(), id = useId();
  const result = equivalentArea(Number(draft.area), Number(draft.coefficient));
  return <section className={styles.directionCard} aria-label={d(`kinds.${draft.kind}`)} data-creation-direction={draft.key}>
    <div className={styles.directionHeader}><WorkDirectionIcon kind={draft.kind} className="size-5 shrink-0"/><button id={`${id}-toggle`} type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className={styles.draftToggle}><span className="min-w-0 flex-1 break-words text-left">{draft.name || d(`kinds.${draft.kind}`)}</span><ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}/></button><Button variant="ghost" type="button" className="size-9 shrink-0 p-0" aria-label={t("removeDirection", { name: draft.name })} onClick={onRemove}><X aria-hidden="true" className="size-4"/></Button></div>
    <AnimatedFormContent id={id} labelledBy={`${id}-toggle`} isOpen={open}>
      <div className="grid gap-3 pb-3">
        <label className={styles.smallField}>{d("name")}<Input value={draft.name} maxLength={80} aria-invalid={invalid && !draft.name.trim()} onChange={event => onChange({ name: event.target.value, nameEdited: true })}/></label>
        <div className="grid grid-cols-2 gap-3"><label className={styles.smallField}>{d("area")}<span className="relative"><Input value={draft.area} type="number" min="0.01" step="0.01" inputMode="decimal" className="ui-numeric pr-8" aria-invalid={invalid && !(Number(draft.area) > 0)} onChange={event => onChange({ area: event.target.value })}/><span aria-hidden="true" className="pointer-events-none absolute right-3 top-3 text-xs text-[var(--ui-text-muted)]">м²</span></span></label><CoefficientStepper value={draft.coefficient} invalid={invalid && !(Number(draft.coefficient) > 0)} onChange={coefficient => onChange({ coefficient })}/></div>
        {invalid ? <p role="alert" className="text-xs text-[var(--ui-danger-text)]">{t("directionsInvalid")}</p> : null}
      </div>
    </AnimatedFormContent>
    <TemplateField value={draft.templateId} templates={templates} onChange={templateId => onChange({ templateId })}/>
    <div className={styles.equivalent}><span>{d("equivalent")}</span><output aria-live="off" className="font-medium text-[var(--ui-text)]">{result === null ? "—" : formatNumber(result, locale)} {d("unitShort")}</output></div>
  </section>;
}

function TemplateField({ value, templates, onChange, initial = false }: { value: string; templates: ProjectTemplate[]; onChange: (value: string) => void; initial?: boolean }) {
  const d = useTranslations("ProjectWorkspace.directions"), t = useTranslations("ProjectForm");
  const template = templates.find(item => item.id === value);
  const stages = !initial && template?.tasks.length ? PROJECT_TEMPLATE_STAGES.filter(stage => template.tasks.some(task => task.stage === stage)) : PROJECT_TEMPLATE_STAGES;
  return <div className="grid gap-1.5"><label className={styles.smallField}>{d("template")}<Select value={value} onValueChange={onChange} size="compact"><SelectItem value="">{d("withoutTemplate")}</SelectItem>{templates.map(template => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</Select></label><p className={styles.directionCaption}>{t("stageComposition", { work: stages.filter(stage => stage !== "stage_4").length, additional: stages.includes("stage_4") ? 1 : 0 })}</p></div>;
}

function TemplateAssignments({ template, members, values, onChange }: { template?: ProjectTemplate; members: ActiveStudioAssignee[]; values: Record<string, string>; onChange: (stage: string, id: string) => void }) {
  const t = useTranslations("ProjectForm");
  if (!template?.tasks.length) return null;
  return <AnimatedDisclosure title={t("templateTeam")} className="mt-1"><div className="grid gap-3 pb-1">{PROJECT_TEMPLATE_STAGES.map((stage, index) => {
    const tasks = getTemplateStageTasks(template, stage);
    return tasks.length ? <div key={stage} className="grid gap-1.5"><label className={styles.smallField}>{t("templateStage", { index: index + 1, count: tasks.length })}<Select value={values[stage] ?? ""} onValueChange={value => onChange(stage, value)} size="compact"><SelectItem value="">{t("unassigned")}</SelectItem>{members.map(member => <SelectItem key={member.id} value={member.id} textValue={member.full_name}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatar_url} name={member.full_name} size="boardCard"/>{member.full_name}</span></SelectItem>)}</Select></label><ol className="list-decimal space-y-1 pl-4 text-xs text-[var(--ui-text-secondary)]">{tasks.map(task => <li key={task.id}>{task.title}</li>)}</ol></div> : null;
  })}</div></AnimatedDisclosure>;
}

function CoefficientStepper({ value, invalid, onChange }: { value: string; invalid: boolean; onChange: (value: string) => void }) {
  const d = useTranslations("ProjectWorkspace.directions"), t = useTranslations("ProjectForm"), id = useId();
  const numeric = Number(value);
  const step = (delta: number) => onChange(String(Number(((Number.isFinite(numeric) ? numeric : 0) + delta).toPrecision(12))));
  return <div className={styles.smallField}><label htmlFor={id}>{d("coefficient")}</label><div className={styles.coefficientStepper} data-invalid={invalid}>
    <button type="button" disabled={!Number.isFinite(numeric) || numeric <= 0.05} aria-label={t("decreaseCoefficient")} title={t("decreaseCoefficient")} onClick={() => step(-0.05)}><Minus aria-hidden="true" className="size-3.5"/></button>
    <Input id={id} value={value} type="number" min="0" step="0.01" inputMode="decimal" aria-invalid={invalid} onChange={event => onChange(event.target.value)} className="ui-numeric"/>
    <button type="button" aria-label={t("increaseCoefficient")} title={t("increaseCoefficient")} onClick={() => step(0.05)}><Plus aria-hidden="true" className="size-3.5"/></button>
  </div></div>;
}
