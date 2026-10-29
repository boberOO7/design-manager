"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { CityCombobox } from "@/components/projects/city-combobox";
import { ProjectCountrySelect, ProjectTypeSelect, useProjectMetadataControls } from "@/components/projects/project-metadata-controls";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectItem } from "@/components/ui/select";
import { createEditProjectSchema, createProjectSchema, getProjectFormInput, getProjectValidationFailure, getProjectValidationMessages, type ProjectFormActionState, type ProjectFormField } from "@/lib/validation/project";
import { cn } from "@/lib/utils";
import type { ProjectTemplate } from "@/lib/project-templates";
import type { ActiveStudioAssignee } from "@/data/queries/project-members";
import type { DirectionPreset } from "@/lib/work-directions";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { ProjectCreationDirections } from "./project-creation-directions";
import { creationDirectionInput, projectCreationDirectionsSchema, type ProjectCreationDirectionDraft } from "@/lib/project-creation-directions";
import styles from "./project-form.module.css";

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
  site_address?: string;
  total_area_m2?: number;
};

export type ProjectFormAction = (state: ProjectFormActionState, formData: FormData) => Promise<ProjectFormActionState>;

const inputClassName = "ui-form-control mt-1.5 h-11 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] transition-colors placeholder:text-[var(--ui-text-muted)] aria-invalid:border-[var(--ui-danger-border)]";

export function ProjectForm({ action, cancelHref, defaultValues = {}, layout = "page", members = [], mode, onCancel, onDirtyChange, onPendingChange, onSuccess, templates = [], presets = [] }: {
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
  presets?: DirectionPreset[];
}) {
  const t = useTranslations("ProjectForm");
  const priority = useTranslations("Priority");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<ProjectFormActionState, FormData>(action, {});
  const [clientValidation, setClientValidation] = useState<{ actionState: ProjectFormActionState; result: ProjectFormActionState } | null>(null);
  const visibleState = clientValidation?.actionState === state ? clientValidation.result : state;
  const metadata = useProjectMetadataControls({
    city: defaultValues.city,
    cityGeoNamesId: defaultValues.city_geonames_id,
    countryCode: defaultValues.country_code,
    projectType: defaultValues.project_type,
    projectTypeCustom: defaultValues.project_type_custom,
  }, () => onDirtyChange?.(true));
  const [stageAssignees, setStageAssignees] = useState<Record<string, string>>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => templates.find(template => template.isActive && template.id === presets.find(preset => preset.kind === "interior")?.template_id)?.id ?? "");
  const [area, setArea] = useState(String(defaultValues.total_area_m2 ?? ""));
  const [directions, setDirections] = useState<ProjectCreationDirectionDraft[]>([]);
  const [invalidDirectionIndex, setInvalidDirectionIndex] = useState<number | null>(null);
  useEffect(() => {
    if (invalidDirectionIndex === null) return;
    const frame = requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[data-creation-direction] [aria-invalid="true"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [invalidDirectionIndex]);

  useEffect(() => {
    const dialog = formRef.current?.closest('[role="dialog"]');
    if (layout === "modal" && dialog === document.activeElement) {
      formRef.current?.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus({ preventScroll: true });
    }
  }, [layout]);

  useEffect(() => {
    if (state.projectId) onSuccess?.(state.projectId);
  }, [onSuccess, state.projectId]);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    if (!visibleState.fieldErrors) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus({ preventScroll: true });
  }, [visibleState.fieldErrors]);

  const fieldError = (field: ProjectFormField) => visibleState.fieldErrors?.[field];
  const errorAttributes = (field: ProjectFormField) => ({
    "aria-describedby": fieldError(field) ? `${field}-error` : undefined,
    "aria-invalid": fieldError(field) ? (true as const) : undefined,
  });
  const dateErrorAttributes = (field: ProjectFormField) => ({
    "aria-describedby": fieldError(field) ? `${field}-error` : undefined,
    "aria-invalid": fieldError(field) ? (true as const) : undefined,
  });
  const markDirty = () => onDirtyChange?.(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    const messages = getProjectValidationMessages(t);
    const parsed = (mode === "create" ? createProjectSchema(messages) : createEditProjectSchema(messages)).safeParse(getProjectFormInput(formData));
    if (!parsed.success) {
      setClientValidation({ actionState: state, result: getProjectValidationFailure(parsed.error, t("validation.correctFields")) });
      return;
    }
    if (mode === "create") {
      const parsedDirections = projectCreationDirectionsSchema.safeParse(directions.map(creationDirectionInput));
      if (!parsedDirections.success) {
        const index = parsedDirections.error.issues[0]?.path[0];
        setInvalidDirectionIndex(typeof index === "number" ? index : null);
        setClientValidation({ actionState: state, result: { formError: t("directionsInvalid") } });
        return;
      }
    }
    setInvalidDirectionIndex(null);
    setClientValidation({ actionState: state, result: {} });
    startTransition(() => formAction(formData));
  }

  const fields = <fieldset disabled={isPending} className={cn(styles.layout, mode === "create" && styles.createLayout)}>
    <div className={styles.fieldGrid}>
    <Field className="sm:col-span-2" error={fieldError("name")} id="name" label={t("projectName")} required>
      <input data-dialog-initial-focus name="project_name" required defaultValue={defaultValues.name} className={inputClassName} autoComplete="off" {...errorAttributes("name")} />
    </Field>

    <Field error={fieldError("project_type")} id="project_type" label={t("projectType")}>
      <ProjectTypeSelect name="project_type" value={metadata.projectType} onValueChange={metadata.changeProjectType} className="mt-1.5" {...errorAttributes("project_type")} />
    </Field>

    <Field error={fieldError("client_name")} id="client_name" label={t("clientName")}>
      <input name="client_name" defaultValue={defaultValues.client_name} className={inputClassName} autoComplete="off" {...errorAttributes("client_name")} />
    </Field>

    {metadata.projectType === "other" ? <Field className="sm:col-span-2" error={fieldError("project_type_custom")} id="project_type_custom" label={t("projectTypeCustom")}>
      <input name="project_type_custom" value={metadata.projectTypeCustom} onChange={(event) => metadata.changeProjectTypeCustom(event.target.value)} className={inputClassName} autoComplete="off" {...errorAttributes("project_type_custom")} />
    </Field> : null}

    <Field error={fieldError("total_area_m2")} id="total_area_m2" label={t("totalArea")} required>
      <input name="total_area_m2" type="number" inputMode="decimal" required min="0.01" step="0.01" value={area} onChange={event => setArea(event.target.value)} className={inputClassName} autoComplete="off" {...errorAttributes("total_area_m2")} />
    </Field>

    <Field error={fieldError("priority")} id="priority" label={t("priority")}>
      <Select name="priority" defaultValue={defaultValues.priority ?? "normal"} onValueChange={markDirty} className="mt-1.5" {...errorAttributes("priority")}>
        <SelectItem value="low">{priority("low")}</SelectItem><SelectItem value="normal">{priority("normal")}</SelectItem><SelectItem value="high">{priority("high")}</SelectItem><SelectItem value="urgent">{priority("urgent")}</SelectItem>
      </Select>
    </Field>

    <Field error={fieldError("country_code")} id="country_code" label={t("country")} required>
      <ProjectCountrySelect name="country_code" required value={metadata.countryCode} onValueChange={metadata.changeCountry} className="mt-1.5" {...errorAttributes("country_code")} />
    </Field>

    <Field error={fieldError("city")} id="city" label={t("city")}>
      <CityCombobox className="mt-1.5" countryCode={metadata.countryCode} describedBy={fieldError("city") ? "city-error" : undefined} invalid={Boolean(fieldError("city"))} name="city_search" value={metadata.city} onGeoNamesIdChange={metadata.setCityGeoNamesId} onValueChange={metadata.changeCity} />
      <input type="hidden" name="city" value={metadata.city} />
      <input type="hidden" name="city_geonames_id" value={metadata.cityGeoNamesId ?? ""} />
    </Field>

    <Field className="sm:col-span-2" error={fieldError("site_address")} id="site_address" label={t("siteAddress")}>
      <input name="site_address" maxLength={500} defaultValue={defaultValues.site_address} className={inputClassName} autoComplete="street-address" {...errorAttributes("site_address")} />
    </Field>

    <Field error={fieldError("start_date")} id="start_date" label={t("plannedStartDate")}>
      <DatePicker name="start_date" defaultValue={defaultValues.start_date} locale={locale} className="mt-1.5" invalid={Boolean(fieldError("start_date"))} {...dateErrorAttributes("start_date")} />
    </Field>

    <Field error={fieldError("due_date")} id="due_date" label={t("dueDate")}>
      <DatePicker name="due_date" defaultValue={defaultValues.due_date} locale={locale} className="mt-1.5" invalid={Boolean(fieldError("due_date"))} {...dateErrorAttributes("due_date")} />
    </Field>

    <Field className="sm:col-span-2" error={fieldError("description")} id="description" label={t("description")}>
      <AutoResizeTextarea name="description" maxLength={5000} defaultValue={defaultValues.description} className={`${inputClassName} min-h-11 py-2.5`} autoComplete="off" {...errorAttributes("description")} />
    </Field>
    </div>
    {mode === "create" ? <ProjectCreationDirections area={area} presets={presets} templates={templates} members={members} templateId={selectedTemplateId} onTemplateChange={id => { setSelectedTemplateId(id); setStageAssignees({}); markDirty(); }} stageAssignees={stageAssignees} onAssigneeChange={(stage, id) => { setStageAssignees(current => ({ ...current, [stage]: id })); markDirty(); }} drafts={directions} onDraftsChange={drafts => { setDirections(drafts); setInvalidDirectionIndex(null); setClientValidation(current => current?.result.formError === t("directionsInvalid") ? null : current); markDirty(); }} invalidIndex={invalidDirectionIndex}/> : null}
  </fieldset>;

  return <form ref={formRef} className={cn(layout === "modal" ? "flex min-h-0 flex-1 flex-col" : "space-y-6")} autoComplete="off" noValidate onInput={markDirty} onSubmit={submit}>
    <div className={cn(layout === "modal" ? "min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] px-4 py-4 sm:px-6" : undefined)}>{fields}
      <p aria-live="polite" className={metadata.countryResetMessage ? "mt-3 text-sm text-[var(--ui-text-muted)]" : "sr-only"}>{metadata.countryResetMessage}</p>
      {visibleState.formError ? <div role="alert" className="mt-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-4 py-3 text-sm text-[var(--ui-danger-text)]">{visibleState.formError}</div> : null}
    </div>
    <div className={cn("flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--ui-border)] sm:flex-row sm:justify-end", layout === "modal" ? "bg-[var(--ui-surface)] px-4 py-3 sm:px-6" : "pt-5")}>
      {onCancel ? <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>{t("cancel")}</Button> : cancelHref ? <Button asChild type="button" variant="outline"><Link href={cancelHref}>{t("cancel")}</Link></Button> : null}
      <Button type="submit" disabled={isPending} aria-busy={isPending}>{isPending ? (mode === "create" ? t("creating") : t("saving")) : (mode === "create" ? t("create") : t("save"))}</Button>
    </div>
  </form>;
}

function Field({ children, className, error, id, label, required = false }: { children: React.ReactNode; className?: string; error?: string; id: ProjectFormField; label: string; required?: boolean }) {
  return <label className={cn("block min-w-0 text-xs font-medium text-[var(--ui-text-secondary)]", className)}>{label}{required ? <span aria-hidden="true" className="text-[var(--ui-danger-text)]"> *</span> : null}{children}{error ? <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}</label>;
}
