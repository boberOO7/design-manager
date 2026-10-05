"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import type { ProjectFormAction } from "@/components/projects/project-form";

function ActualStartPicker({ startedAt, disabled, error, label, locale }: { startedAt: string; disabled: boolean; error: boolean; label: string; locale: string }) {
  const [value, setValue] = useState(startedAt);
  return <DatePicker name="started_at" aria-label={label} aria-describedby={error ? "project-actual-start-error" : undefined} className="w-full sm:w-52" value={value} onValueChange={setValue} disabled={disabled} invalid={error} locale={locale} />;
}

export function ProjectActualStartDateForm({ action, startedAt, locale }: { action: ProjectFormAction; startedAt: string | null; locale: string }) {
  const t = useTranslations("ProjectWorkspace");
  const form = useTranslations("ProjectForm");
  const [state, formAction, isPending] = useActionState(action, {});
  const error = state.fieldErrors?.started_at ?? state.formError;
  const confirmedStartedAt = state.startedAt !== undefined ? state.startedAt : startedAt;

  return <form action={formAction} className="mt-2 flex flex-wrap items-start gap-2">
    <ActualStartPicker key={confirmedStartedAt ?? ""} startedAt={confirmedStartedAt ?? ""} disabled={isPending} error={Boolean(error)} label={t("actualStartDate")} locale={locale} />
    <Button type="submit" disabled={isPending} aria-busy={isPending}>{isPending ? form("saving") : form("save")}</Button>
    {error ? <p id="project-actual-start-error" role="alert" className="basis-full text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
  </form>;
}
