"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import type {
  EditProjectFormValues,
  ProjectFormActionState,
  ProjectFormField,
} from "@/lib/validation/project";

type ProjectFormDefaults = Partial<EditProjectFormValues>;
type ProjectFormAction = (
  state: ProjectFormActionState,
  formData: FormData,
) => Promise<ProjectFormActionState>;

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2.5 text-sm text-[var(--ui-text)] outline-none transition focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)]";

export function ProjectForm({
  action,
  cancelHref,
  defaultValues = {},
  mode,
}: {
  action: ProjectFormAction;
  cancelHref: string;
  defaultValues?: ProjectFormDefaults;
  mode: "create" | "edit";
}) {
  const t = useTranslations("ProjectForm"); const priority = useTranslations("Priority");
  const [state, formAction, isPending] = useActionState<ProjectFormActionState, FormData>(
    action,
    {},
  );

  const fieldError = (field: ProjectFormField) => state.fieldErrors?.[field];
  const errorAttributes = (field: ProjectFormField) => ({
    "aria-describedby": fieldError(field) ? `${field}-error` : undefined,
    "aria-invalid": fieldError(field) ? (true as const) : undefined,
  });

  return (
    <form className="space-y-6" action={formAction} noValidate>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm font-medium text-[var(--ui-text-secondary)] md:col-span-2">
          {t("projectName")} <span className="text-[var(--ui-danger-text)]">*</span>
          <input name="name" required defaultValue={defaultValues.name} className={inputClassName} autoComplete="off" {...errorAttributes("name")} />
          {fieldError("name") ? <p id="name-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{fieldError("name")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
          {t("projectCode")}
          <input name="project_code" defaultValue={defaultValues.project_code} className={inputClassName} autoComplete="off" {...errorAttributes("project_code")} />
          {fieldError("project_code") ? <p id="project_code-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{fieldError("project_code")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
          {t("clientName")}
          <input name="client_name" defaultValue={defaultValues.client_name} className={inputClassName} autoComplete="organization" {...errorAttributes("client_name")} />
          {fieldError("client_name") ? <p id="client_name-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{fieldError("client_name")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-[var(--ui-text-secondary)] md:col-span-2">
          {t("description")}
          <textarea name="description" defaultValue={defaultValues.description} className={`${inputClassName} min-h-28 resize-y`} {...errorAttributes("description")} />
          {fieldError("description") ? <p id="description-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{fieldError("description")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
          {t("totalArea")} <span className="text-[var(--ui-danger-text)]">*</span>
          <input name="total_area_m2" type="number" required min="0.01" step="0.01" defaultValue={defaultValues.total_area_m2} className={inputClassName} {...errorAttributes("total_area_m2")} />
          {fieldError("total_area_m2") ? <p id="total_area_m2-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{fieldError("total_area_m2")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
          {t("priority")}
          <select name="priority" defaultValue={defaultValues.priority ?? "normal"} className={inputClassName} {...errorAttributes("priority")}>
            <option value="low">{priority("low")}</option>
            <option value="normal">{priority("normal")}</option>
            <option value="high">{priority("high")}</option>
            <option value="urgent">{priority("urgent")}</option>
          </select>
          {fieldError("priority") ? <p id="priority-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{fieldError("priority")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
          {t("startDate")} <span className="text-[var(--ui-danger-text)]">*</span>
          <input name="start_date" type="date" required defaultValue={defaultValues.start_date} className={inputClassName} {...errorAttributes("start_date")} />
          {fieldError("start_date") ? <p id="start_date-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{fieldError("start_date")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
          {t("dueDate")}
          <input name="due_date" type="date" defaultValue={defaultValues.due_date} className={inputClassName} {...errorAttributes("due_date")} />
          {fieldError("due_date") ? <p id="due_date-error" className="mt-1.5 text-sm text-[var(--ui-danger-text)]">{fieldError("due_date")}</p> : null}
        </label>

      </div>

      {state.formError ? (
        <div role="alert" className="rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-4 py-3 text-sm text-[var(--ui-danger-text)]">
          {state.formError}
        </div>
      ) : null}

      <div className="flex justify-end gap-3 border-t border-[var(--ui-border)] pt-5">
        <Button asChild type="button" variant="outline">
          <Link href={cancelHref}>{t("cancel")}</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (mode === "create" ? t("creating") : t("saving")) : (mode === "create" ? t("create") : t("save"))}
        </Button>
      </div>
    </form>
  );
}
