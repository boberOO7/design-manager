"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import type { ProjectFormAction } from "@/components/projects/project-form";
import { useTranslations } from "next-intl";

export function ProjectCompletionDateForm({ action, completedAt, locale }: { action: ProjectFormAction; completedAt: string; locale: string }) {
  const t = useTranslations("ProjectWorkspace");
  const form = useTranslations("ProjectForm");
  const [state, formAction, isPending] = useActionState(action, {});
  const error = state.fieldErrors?.completed_at ?? state.formError;

  return <form action={formAction} className="mt-2 flex flex-wrap items-start gap-2">
    <DatePicker aria-describedby={error ? "project-completion-date-error" : undefined} aria-label={t("completionDate")} className="w-full sm:w-52" defaultValue={completedAt} disabled={isPending} invalid={Boolean(error)} locale={locale} name="completed_at" />
    <Button type="submit" disabled={isPending} aria-busy={isPending}>{isPending ? form("saving") : form("save")}</Button>
    {error ? <p id="project-completion-date-error" role="alert" className="basis-full text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
  </form>;
}
