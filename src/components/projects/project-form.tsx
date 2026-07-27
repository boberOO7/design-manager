"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
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
  "mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-900 focus:ring-2 focus:ring-stone-200";

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
        <label className="block text-sm font-medium text-stone-700 md:col-span-2">
          Project name <span className="text-red-600">*</span>
          <input name="name" required defaultValue={defaultValues.name} className={inputClassName} autoComplete="off" {...errorAttributes("name")} />
          {fieldError("name") ? <p id="name-error" className="mt-1.5 text-sm text-red-600">{fieldError("name")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Project code
          <input name="project_code" defaultValue={defaultValues.project_code} className={inputClassName} autoComplete="off" {...errorAttributes("project_code")} />
          {fieldError("project_code") ? <p id="project_code-error" className="mt-1.5 text-sm text-red-600">{fieldError("project_code")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Client name
          <input name="client_name" defaultValue={defaultValues.client_name} className={inputClassName} autoComplete="organization" {...errorAttributes("client_name")} />
          {fieldError("client_name") ? <p id="client_name-error" className="mt-1.5 text-sm text-red-600">{fieldError("client_name")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700 md:col-span-2">
          Description
          <textarea name="description" defaultValue={defaultValues.description} className={`${inputClassName} min-h-28 resize-y`} {...errorAttributes("description")} />
          {fieldError("description") ? <p id="description-error" className="mt-1.5 text-sm text-red-600">{fieldError("description")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Total area (m²) <span className="text-red-600">*</span>
          <input name="total_area_m2" type="number" required min="0.01" step="0.01" defaultValue={defaultValues.total_area_m2} className={inputClassName} {...errorAttributes("total_area_m2")} />
          {fieldError("total_area_m2") ? <p id="total_area_m2-error" className="mt-1.5 text-sm text-red-600">{fieldError("total_area_m2")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Priority
          <select name="priority" defaultValue={defaultValues.priority ?? "normal"} className={inputClassName} {...errorAttributes("priority")}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          {fieldError("priority") ? <p id="priority-error" className="mt-1.5 text-sm text-red-600">{fieldError("priority")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Start date <span className="text-red-600">*</span>
          <input name="start_date" type="date" required defaultValue={defaultValues.start_date} className={inputClassName} {...errorAttributes("start_date")} />
          {fieldError("start_date") ? <p id="start_date-error" className="mt-1.5 text-sm text-red-600">{fieldError("start_date")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Due date
          <input name="due_date" type="date" defaultValue={defaultValues.due_date} className={inputClassName} {...errorAttributes("due_date")} />
          {fieldError("due_date") ? <p id="due_date-error" className="mt-1.5 text-sm text-red-600">{fieldError("due_date")}</p> : null}
        </label>

        {mode === "edit" ? (
          <label className="block text-sm font-medium text-stone-700">
            Status
            <select name="status" defaultValue={defaultValues.status ?? "planned"} className={inputClassName} {...errorAttributes("status")}>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
            {fieldError("status") ? <p id="status-error" className="mt-1.5 text-sm text-red-600">{fieldError("status")}</p> : null}
          </label>
        ) : null}
      </div>

      {state.formError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.formError}
        </div>
      ) : null}

      <div className="flex justify-end gap-3 border-t border-stone-200 pt-5">
        <Button asChild type="button" variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (mode === "create" ? "Creating…" : "Saving…") : (mode === "create" ? "Create project" : "Save changes")}
        </Button>
      </div>
    </form>
  );
}
