"use client";

import { useTranslations } from "next-intl";
import { Select, SelectItem } from "@/components/ui/select";
import { isStageProgressMethod } from "@/lib/project-progress";
import type { TemplateStageNames, TemplateStageProgressMethods } from "@/lib/project-templates";

export function TemplateStageProgressFields({ methods, onChange, disabled = false, stageNames = {} }: {
  methods: TemplateStageProgressMethods;
  onChange: (methods: TemplateStageProgressMethods) => void;
  disabled?: boolean;
  stageNames?: TemplateStageNames;
}) {
  const t = useTranslations("Tasks.stageProgressMethods"), stages = useTranslations("TaskStages");
  return <fieldset className="mt-4 space-y-2">
    <legend className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("title")}</legend>
    <div className="grid gap-3 sm:grid-cols-3">{(["stage_1", "stage_2", "stage_3"] as const).map(stage => <label key={stage} className="grid gap-1.5 text-xs text-[var(--ui-text-muted)]">
      {stageNames[stage] || stages(stage)}<Select aria-label={`${stageNames[stage] || stages(stage)}: ${t("title")}`} size="compact" value={methods[stage] ?? "equal"} disabled={disabled} onValueChange={value => { if (isStageProgressMethod(value)) onChange({ ...methods, [stage]: value }); }}>
        {(["equal", "area", "weighted"] as const).map(method => <SelectItem key={method} value={method}>{t(`${method}.label`)}</SelectItem>)}
      </Select>
    </label>)}</div>
    <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("templateHelp")}</p>
  </fieldset>;
}
