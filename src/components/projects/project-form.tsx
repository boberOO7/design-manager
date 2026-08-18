"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CityCombobox } from "@/components/projects/city-combobox";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectItem } from "@/components/ui/select";
import { getCountryOptions } from "@/lib/countries";
import { PROJECT_TYPE_KEYS, type ProjectFormActionState, type ProjectFormField } from "@/lib/validation/project";
import { cn } from "@/lib/utils";

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

export function ProjectForm({ action, cancelHref, defaultValues = {}, layout = "page", mode, onCancel, onDirtyChange, onPendingChange, onSuccess }: {
  action: ProjectFormAction;
  cancelHref?: string;
  defaultValues?: ProjectFormDefaults;
  layout?: "modal" | "page";
  mode: "create" | "edit";
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onSuccess?: (projectId: string) => void;
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
      <Select name="project_type" value={projectType} onValueChange={(value) => { setProjectType(value); if (value !== "other") setProjectTypeCustom(""); markDirty(); }} className="mt-2" {...errorAttributes("project_type")}>
        <SelectItem value="">{t("notSpecified")}</SelectItem>
        {PROJECT_TYPE_KEYS.map((key) => <SelectItem key={key} value={key}>{projectTypes(key)}</SelectItem>)}
      </Select>
    </Field>

    {projectType === "other" ? <Field error={fieldError("project_type_custom")} id="project_type_custom" label={t("projectTypeCustom")}>
      <input name="project_type_custom" value={projectTypeCustom} onChange={(event) => { setProjectTypeCustom(event.target.value); markDirty(); }} className={inputClassName} autoComplete="off" {...errorAttributes("project_type_custom")} />
    </Field> : null}

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
