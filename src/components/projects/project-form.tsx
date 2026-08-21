"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check } from "lucide-react";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CityCombobox } from "@/components/projects/city-combobox";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectItem } from "@/components/ui/select";
import { getCountryOptions } from "@/lib/countries";
import { PROJECT_TYPE_KEYS, type ProjectFormActionState, type ProjectFormField } from "@/lib/validation/project";
import { cn } from "@/lib/utils";
import { getActiveProjectTemplatesForType, getDefaultProjectTemplate, getTemplateStageTasks, PROJECT_TEMPLATE_STAGES, type ProjectTemplate } from "@/lib/project-templates";
import type { ActiveStudioAssignee } from "@/data/queries/project-members";
import { UserAvatar } from "@/components/ui/user-avatar";

export type ProjectFormDefaults = {
  city?: string;
  city_geonames_id?: number;
  client_name?: string;
  country_code?: string;
  description?: string;
  due_date?: string;
  name?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  project_type?: string;
  project_type_custom?: string;
  start_date?: string;
  total_area_m2?: number;
};

export type ProjectFormAction = (state: ProjectFormActionState, formData: FormData) => Promise<ProjectFormActionState>;

const inputClassName = "mt-2 h-11 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)] aria-invalid:border-[var(--ui-danger-border)] aria-invalid:focus:ring-[var(--ui-danger-text)]";

export function ProjectForm({ action, cancelHref, defaultValues = {}, layout = "page", members = [], mode, onCancel, onDirtyChange, onPendingChange, onSuccess, templates = [] }: {
  action: ProjectFormAction;
  cancelHref?: string;
  defaultValues?: ProjectFormDefaults;
  layout?: "modal" | "page";
  members?: ActiveStudioAssignee[];
  mode: "create" | "edit";
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onSuccess?: (projectId: string) => void;
  templates?: ProjectTemplate[];
}) {
  const t = useTranslations("ProjectForm");
  const priority = useTranslations("Priority");
  const projectTypes = useTranslations("ProjectTypes");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<ProjectFormActionState, FormData>(action, {});
  const [projectType, setProjectType] = useState(defaultValues.project_type ?? "");
  const [projectTypeCustom, setProjectTypeCustom] = useState(defaultValues.project_type_custom ?? "");
  const [countryCode, setCountryCode] = useState(defaultValues.country_code ?? "UA");
  const [city, setCity] = useState(defaultValues.city ?? "");
  const [cityGeoNamesId, setCityGeoNamesId] = useState(defaultValues.city_geonames_id);
  const [countryResetMessage, setCountryResetMessage] = useState("");
  const [stageAssignees, setStageAssignees] = useState<Record<string, string>>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => getDefaultProjectTemplate(templates, defaultValues.project_type ?? "")?.id ?? "");
  const countryOptions = useMemo(() => getCountryOptions(locale), [locale]);

  useEffect(() => {
    if (state.projectId) onSuccess?.(state.projectId);
  }, [onSuccess, state.projectId]);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    if (!state.fieldErrors) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus({ preventScroll: true });
  }, [state.fieldErrors]);

  const fieldError = (field: ProjectFormField) => state.fieldErrors?.[field];
  const errorAttributes = (field: ProjectFormField) => ({
    "aria-describedby": fieldError(field) ? `${field}-error` : undefined,
    "aria-invalid": fieldError(field) ? (true as const) : undefined,
  });
  const dateErrorAttributes = (field: ProjectFormField) => ({
    "aria-describedby": fieldError(field) ? `${field}-error` : undefined,
  });
  const markDirty = () => onDirtyChange?.(true);

  function changeProjectType(value: string) {
    setProjectType(value);
    setStageAssignees({});
    setSelectedTemplateId(getDefaultProjectTemplate(templates, value)?.id ?? "");
    if (value !== "other") setProjectTypeCustom("");
    markDirty();
  }

  function changeCountry(nextCountryCode: string) {
    if (nextCountryCode === countryCode) return;
    setCountryCode(nextCountryCode);
    setCityGeoNamesId(undefined);
    if (city) {
      setCity("");
      setCountryResetMessage(t("cityCleared"));
    }
    markDirty();
  }

  const fields = <div className="grid gap-4 md:grid-cols-2">
    <Field className="md:col-span-2" error={fieldError("name")} id="name" label={t("projectName")} required>
      <input data-dialog-initial-focus name="project_name" required defaultValue={defaultValues.name} className={inputClassName} autoComplete="off" {...errorAttributes("name")} />
    </Field>

    <Field error={fieldError("project_type")} id="project_type" label={t("projectType")}>
      <Select name="project_type" value={projectType} onValueChange={changeProjectType} className="mt-2" {...errorAttributes("project_type")}>
        <SelectItem value="">{t("notSpecified")}</SelectItem>
        {PROJECT_TYPE_KEYS.map((key) => <SelectItem key={key} value={key}>{projectTypes(key)}</SelectItem>)}
      </Select>
    </Field>

    {projectType === "other" ? <Field error={fieldError("project_type_custom")} id="project_type_custom" label={t("projectTypeCustom")}>
      <input name="project_type_custom" value={projectTypeCustom} onChange={(event) => { setProjectTypeCustom(event.target.value); markDirty(); }} className={inputClassName} autoComplete="off" {...errorAttributes("project_type_custom")} />
    </Field> : null}

    {mode === "create" ? <TemplateSummary selectedTemplateId={selectedTemplateId} templates={getActiveProjectTemplatesForType(templates, projectType)} members={members} stageAssignees={stageAssignees} onTemplateChange={(id) => { setSelectedTemplateId(id); setStageAssignees({}); markDirty(); }} onAssigneeChange={(stage, assigneeId) => { setStageAssignees((current) => ({ ...current, [stage]: assigneeId })); markDirty(); }} /> : null}

    <Field error={fieldError("client_name")} id="client_name" label={t("clientName")}>
      <input name="client_name" defaultValue={defaultValues.client_name} className={inputClassName} autoComplete="off" {...errorAttributes("client_name")} />
    </Field>

    <Field error={fieldError("country_code")} id="country_code" label={t("country")} required>
      <Select name="country_code" required value={countryCode} onValueChange={changeCountry} className="mt-2" {...errorAttributes("country_code")}>
        {countryOptions.map((country) => <SelectItem key={country.code} value={country.code} textValue={country.label}>{country.label}</SelectItem>)}
      </Select>
    </Field>

    <Field error={fieldError("city")} id="city" label={t("city")}>
      <CityCombobox countryCode={countryCode} describedBy={fieldError("city") ? "city-error" : undefined} invalid={Boolean(fieldError("city"))} name="city_search" value={city} onGeoNamesIdChange={setCityGeoNamesId} onValueChange={(value) => { setCity(value); markDirty(); }} />
      <input type="hidden" name="city" value={city} />
      <input type="hidden" name="city_geonames_id" value={cityGeoNamesId ?? ""} />
    </Field>

    <Field error={fieldError("total_area_m2")} id="total_area_m2" label={t("totalArea")} required>
      <input name="total_area_m2" type="number" inputMode="decimal" required min="0.01" step="0.01" defaultValue={defaultValues.total_area_m2} className={inputClassName} autoComplete="off" {...errorAttributes("total_area_m2")} />
    </Field>

    <Field error={fieldError("priority")} id="priority" label={t("priority")}>
      <Select name="priority" defaultValue={defaultValues.priority ?? "normal"} onValueChange={markDirty} className="mt-2" {...errorAttributes("priority")}>
        <SelectItem value="low">{priority("low")}</SelectItem><SelectItem value="normal">{priority("normal")}</SelectItem><SelectItem value="high">{priority("high")}</SelectItem><SelectItem value="urgent">{priority("urgent")}</SelectItem>
      </Select>
    </Field>

    <Field error={fieldError("start_date")} id="start_date" label={t("plannedStartDate")} required>
      <DatePicker name="start_date" defaultValue={defaultValues.start_date} locale={locale} className="mt-2" invalid={Boolean(fieldError("start_date"))} {...dateErrorAttributes("start_date")} />
    </Field>

    <Field error={fieldError("due_date")} id="due_date" label={t("dueDate")}>
      <DatePicker name="due_date" defaultValue={defaultValues.due_date} locale={locale} className="mt-2" invalid={Boolean(fieldError("due_date"))} {...dateErrorAttributes("due_date")} />
    </Field>

    <Field className="md:col-span-2" error={fieldError("description")} id="description" label={t("description")}>
      <textarea name="description" defaultValue={defaultValues.description} className={`${inputClassName} min-h-24 resize-y py-2.5`} autoComplete="off" {...errorAttributes("description")} />
    </Field>
  </div>;

  return <form ref={formRef} className={cn(layout === "modal" ? "flex min-h-0 flex-1 flex-col" : "space-y-6")} action={formAction} autoComplete="off" noValidate onInput={markDirty} onSubmit={(event) => { if (isPending) event.preventDefault(); }}>
    <div className={cn(layout === "modal" ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6" : undefined)}>{fields}
      <p aria-live="polite" className={countryResetMessage ? "mt-3 text-sm text-[var(--ui-text-muted)]" : "sr-only"}>{countryResetMessage}</p>
      {state.formError ? <div role="alert" className="mt-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-4 py-3 text-sm text-[var(--ui-danger-text)]">{state.formError}</div> : null}
    </div>
    <div className={cn("flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--ui-border)] sm:flex-row sm:justify-end", layout === "modal" ? "bg-[var(--ui-surface)] px-4 py-3 sm:px-6" : "pt-5")}>
      {onCancel ? <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>{t("cancel")}</Button> : cancelHref ? <Button asChild type="button" variant="outline"><Link href={cancelHref}>{t("cancel")}</Link></Button> : null}
      <Button type="submit" disabled={isPending} aria-busy={isPending}>{isPending ? (mode === "create" ? t("creating") : t("saving")) : (mode === "create" ? t("create") : t("save"))}</Button>
    </div>
  </form>;
}

function Field({ children, className, error, id, label, required = false }: { children: React.ReactNode; className?: string; error?: string; id: ProjectFormField; label: string; required?: boolean }) {
  return <label className={cn("block text-sm font-medium text-[var(--ui-text-secondary)]", className)}>{label}{required ? <span aria-hidden="true" className="text-[var(--ui-danger-text)]"> *</span> : null}{children}{error ? <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}</label>;
}

function TemplateSummary({ members, onAssigneeChange, onTemplateChange, selectedTemplateId, stageAssignees, templates }: { members: ActiveStudioAssignee[]; onAssigneeChange: (stage: string, assigneeId: string) => void; onTemplateChange: (id: string) => void; selectedTemplateId: string; stageAssignees: Record<string, string>; templates: ProjectTemplate[] }) {
  const [isChooserOpen, setIsChooserOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const template = templates.find((item) => item.id === selectedTemplateId) ?? null;
  const populatedStages = template ? PROJECT_TEMPLATE_STAGES.map((stage, index) => ({ index, stage, tasks: getTemplateStageTasks(template, stage) })).filter(({ tasks }) => tasks.length > 0) : [];

  function chooseTemplate(id: string) {
    onTemplateChange(id);
    setIsChooserOpen(false);
  }

  return <section className="md:col-span-2 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-4" aria-labelledby="project-template-summary">
    <input type="hidden" name="project_template_id" value={selectedTemplateId} />
    {PROJECT_TEMPLATE_STAGES.filter((stage) => !populatedStages.some((item) => item.stage === stage)).map((stage) => <input key={stage} type="hidden" name={`stage_assignee_${stage}`} value="" />)}
    {template ? <><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-[var(--ui-text-secondary)]">Шаблон</p><div className="mt-1 flex flex-wrap items-center gap-2"><h3 id="project-template-summary" className="text-base font-semibold text-[var(--ui-text)]">{template.name}</h3>{template.isDefault ? <span className="rounded-full bg-[var(--ui-success-surface)] px-2 py-0.5 text-xs font-medium text-[var(--ui-success-text)]">За замовчуванням</span> : null}</div><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{template.tasks.length} задач · {populatedStages.length} етапи</p></div><TemplateChooser isOpen={isChooserOpen} onOpenChange={setIsChooserOpen} onSelect={chooseTemplate} selectedTemplateId={selectedTemplateId} templates={templates} /></div>
    <div className="mt-3 flex flex-wrap items-center gap-3"><Button type="button" size="sm" variant="outline" onClick={() => setIsExpanded((current) => !current)} aria-expanded={isExpanded}>{isExpanded ? "Сховати структуру" : "Переглянути структуру"}</Button></div>
    {populatedStages.length ? <div className="mt-4 border-t border-[var(--ui-border)] pt-4"><p className="mb-2 text-sm font-medium text-[var(--ui-text-secondary)]">Виконавці шаблону</p><div className="space-y-2">{populatedStages.map(({ index, stage, tasks }) => <div key={stage} className="grid gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center"><div><p className="text-sm font-medium text-[var(--ui-text)]">Етап {index + 1} · {tasks.length} {tasks.length === 1 ? "задача" : "задач"}</p>{isExpanded ? <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--ui-text-secondary)]">{tasks.map((task) => <li key={task.id}>{task.title}</li>)}</ol> : null}</div><Select name={`stage_assignee_${stage}`} value={stageAssignees[stage] ?? ""} onValueChange={(value) => onAssigneeChange(stage, value)}><SelectItem value="">Не призначено</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id} textValue={member.full_name}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatar_url} name={member.full_name} />{member.full_name}</span></SelectItem>)}</Select></div>)}</div></div> : null}
    </> : <div className="flex flex-wrap items-center justify-between gap-3"><div><p id="project-template-summary" className="text-sm font-medium text-[var(--ui-text-secondary)]">Шаблон</p><p className="mt-1 text-sm text-[var(--ui-text-muted)]">Проєкт буде створено без згенерованих задач.</p></div><TemplateChooser isOpen={isChooserOpen} onOpenChange={setIsChooserOpen} onSelect={chooseTemplate} selectedTemplateId={selectedTemplateId} templates={templates} /></div>}</section>;
}

function TemplateChooser({ isOpen, onOpenChange, onSelect, selectedTemplateId, templates }: { isOpen: boolean; onOpenChange: (isOpen: boolean) => void; onSelect: (id: string) => void; selectedTemplateId: string; templates: ProjectTemplate[] }) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => setPortalContainer(node?.closest<HTMLElement>("dialog, [role='dialog']") ?? null), []);
  return <PopoverPrimitive.Root modal={false} open={isOpen} onOpenChange={onOpenChange}><PopoverPrimitive.Trigger asChild><Button ref={setTriggerRef} type="button" size="sm" variant="outline">Змінити</Button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal container={portalContainer ?? undefined}><PopoverPrimitive.Content align="end" sideOffset={6} collisionPadding={12} className="z-[80] w-[min(20rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><div role="menu" aria-label="Вибрати шаблон проєкту"><TemplateChooserItem label="Без шаблону" onSelect={() => onSelect("")} selected={selectedTemplateId === ""} />{templates.map((item) => <TemplateChooserItem key={item.id} defaultTemplate={item.isDefault} label={item.name} onSelect={() => onSelect(item.id)} selected={selectedTemplateId === item.id} />)}</div></PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root>;
}

function TemplateChooserItem({ defaultTemplate = false, label, onSelect, selected }: { defaultTemplate?: boolean; label: string; onSelect: () => void; selected: boolean }) {
  return <button type="button" role="menuitemradio" aria-checked={selected} onClick={onSelect} className="grid min-h-10 w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-2 py-2 text-left text-sm text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="flex size-4 items-center justify-center text-[var(--ui-text)]">{selected ? <Check aria-hidden="true" className="size-3.5" /> : null}</span><span className="min-w-0 truncate">{label}</span>{defaultTemplate ? <span className="text-xs text-[var(--ui-success-text)]">За замовчуванням</span> : null}</button>;
}
