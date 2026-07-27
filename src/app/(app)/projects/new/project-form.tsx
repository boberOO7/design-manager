"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { projectSchema, type ProjectFormValues } from "@/lib/validation/project";
import { createProject, type CreateProjectActionState } from "./actions";

const inputClassName =
  "mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-900 focus:ring-2 focus:ring-stone-200";

export function ProjectForm() {
  const [isPending, startTransition] = useTransition();
  const [submissionState, setSubmissionState] = useState<CreateProjectActionState | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      project_code: "",
      client_name: "",
      description: "",
      status: "planned",
      priority: "normal",
      start_date: "",
      due_date: "",
    },
  });

  const fieldError = (field: keyof ProjectFormValues) =>
    errors[field]?.message ?? submissionState?.fieldErrors?.[field];

  const onSubmit = (values: ProjectFormValues) => {
    setSubmissionState(null);
    startTransition(async () => {
      const result = await createProject(values);
      setSubmissionState(result);
    });
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm font-medium text-stone-700 md:col-span-2">
          Project name <span className="text-red-600">*</span>
          <input {...register("name")} className={inputClassName} autoComplete="off" />
          {fieldError("name") ? <p className="mt-1.5 text-sm text-red-600">{fieldError("name")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Project code
          <input {...register("project_code")} className={inputClassName} autoComplete="off" />
          {fieldError("project_code") ? <p className="mt-1.5 text-sm text-red-600">{fieldError("project_code")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Client name
          <input {...register("client_name")} className={inputClassName} autoComplete="organization" />
          {fieldError("client_name") ? <p className="mt-1.5 text-sm text-red-600">{fieldError("client_name")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700 md:col-span-2">
          Description
          <textarea {...register("description")} className={`${inputClassName} min-h-28 resize-y`} />
          {fieldError("description") ? <p className="mt-1.5 text-sm text-red-600">{fieldError("description")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Total area (m²) <span className="text-red-600">*</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            {...register("total_area_m2", { valueAsNumber: true })}
            className={inputClassName}
          />
          {fieldError("total_area_m2") ? <p className="mt-1.5 text-sm text-red-600">{fieldError("total_area_m2")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Status
          <select {...register("status")} className={inputClassName}>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
          {fieldError("status") ? <p className="mt-1.5 text-sm text-red-600">{fieldError("status")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Priority
          <select {...register("priority")} className={inputClassName}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          {fieldError("priority") ? <p className="mt-1.5 text-sm text-red-600">{fieldError("priority")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Start date <span className="text-red-600">*</span>
          <input type="date" {...register("start_date")} className={inputClassName} />
          {fieldError("start_date") ? <p className="mt-1.5 text-sm text-red-600">{fieldError("start_date")}</p> : null}
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Due date
          <input type="date" {...register("due_date")} className={inputClassName} />
          {fieldError("due_date") ? <p className="mt-1.5 text-sm text-red-600">{fieldError("due_date")}</p> : null}
        </label>
      </div>

      {submissionState?.error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {submissionState.error}
        </div>
      ) : null}

      <div className="flex justify-end gap-3 border-t border-stone-200 pt-5">
        <Button asChild type="button" variant="outline">
          <Link href="/projects">Cancel</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
