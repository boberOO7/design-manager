"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ExpenseAutomation } from "@/lib/finance-expenses";
import { FormField } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDateOnly } from "@/lib/utils";
import { AnimatedFormContent } from "@/components/ui/animated-form-content";

export function RecurringArrangementFields({ policy, projects, projectEnabled, coverageRequired }: {
  policy?: ExpenseAutomation["policies"][number];
  projects: ExpenseAutomation["projects"];
  projectEnabled: boolean;
  coverageRequired: boolean;
}) {
  const t = useTranslations("Finance.expenses"), locale = useLocale();
  const [mode, setMode] = useState<string>(policy?.policy ?? "");
  const [start, setStart] = useState("");
  const [project, setProject] = useState(policy?.project_id ?? "");
  const hasServicePeriod = Boolean(mode && mode !== "manual");
  return <fieldset className="space-y-3 border-t border-[var(--ui-border-subtle)] pt-4">
    <legend className="text-sm font-semibold">{t("serviceTerms")}</legend>
    <p className="text-xs leading-relaxed text-[var(--ui-text-muted)]">{t("arrangementHelp")}</p>
    {policy ? <p className="text-xs text-[var(--ui-text-muted)]">{t("sourcePreserved", { date: formatDateOnly(policy.coverage_from ?? policy.service_start, locale) })}</p> : null}
    <div className="grid items-start gap-x-4 sm:grid-cols-2">
      <FormField label={t("sourceTreatment")}><Select name="servicePolicy" aria-label={t("sourceTreatment")} value={mode} onValueChange={setMode} required>
        <SelectItem value="service_days">{t("sourceStandardService")}</SelectItem>
        <SelectItem value="manual">{t("sourceAfterDelivery")}</SelectItem>
        {policy?.policy === "period_end" ? <SelectItem value="period_end">{t("policy.period_end")}</SelectItem> : null}
      </Select></FormField>
      <AnimatedFormContent isOpen={hasServicePeriod} className="duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"><fieldset disabled={!hasServicePeriod} className="pt-3 sm:pt-0">
        <FormField label={t("serviceStart")} optional={!coverageRequired} optionalLabel={t("sourceOptional")}><DatePicker name="serviceStart" aria-label={t("serviceStart")} value={start} onValueChange={setStart} locale={locale} required={coverageRequired}/></FormField>
      </fieldset></AnimatedFormContent>
    </div>
    {projectEnabled ? <AnimatedFormContent isOpen={hasServicePeriod} className="duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"><fieldset disabled={!hasServicePeriod}>
      <FormField label={t("project")}><Select name="serviceProjectId" aria-label={t("project")} value={project} onValueChange={setProject}><SelectItem value="">{t("studioOverhead")}</SelectItem>{projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</Select></FormField>
    </fieldset></AnimatedFormContent> : null}
    {!hasServicePeriod ? <input type="hidden" name="serviceStart" value=""/> : null}
    {!hasServicePeriod || !projectEnabled ? <input type="hidden" name="serviceProjectId" value={project}/> : null}
    <AnimatedFormContent isOpen={mode === "manual"} className="duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"><p className="text-sm text-[var(--ui-text-secondary)]">{t("sourceDeliveryHelp")}</p></AnimatedFormContent>
  </fieldset>;
}
