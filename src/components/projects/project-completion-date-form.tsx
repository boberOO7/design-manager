"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import type { ProjectFormAction } from "@/components/projects/project-form";
import { useTranslations } from "next-intl";

function CompletionDatePicker({ completedAt, disabled, error, label, locale }: { completedAt: string; disabled: boolean; error: boolean; label: string; locale: string }) {
  const [value, setValue] = useState(completedAt);
  return <DatePicker aria-describedby={error ? "project-completion-date-error" : undefined} aria-label={label} className="w-full sm:w-52" value={value} onValueChange={setValue} disabled={disabled} invalid={error} locale={locale} name="completed_at" />;
}

export function ProjectCompletionDateForm({ action, completedAt, locale }: { action: ProjectFormAction; completedAt: string; locale: string }) {
  const t = useTranslations("ProjectWorkspace");
  const form = useTranslations("ProjectForm");
  const [state, formAction, isPending] = useActionState(action, {});
  const error = state.fieldErrors?.completed_at ?? state.formError;
  const confirmedCompletedAt = state.completedAt ?? completedAt;

  return <form action={formAction} className="mt-2 flex flex-wrap items-start gap-2">
    <CompletionDatePicker key={confirmedCompletedAt} completedAt={confirmedCompletedAt} disabled={isPending} error={Boolean(error)} label={t("completionDate")} locale={locale} />
    <Button type="submit" disabled={isPending} aria-busy={isPending}>{isPending ? form("saving") : form("save")}</Button>
    {error ? <p id="project-completion-date-error" role="alert" className="basis-full text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
  </form>;
}
