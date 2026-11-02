"use client";

import { useLocale, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { FormField, Input } from "@/components/ui/form-field";
import type { AreaComponent } from "@/lib/work-direction-components";
import { equivalentArea } from "@/lib/work-directions";

export function WorkDirectionComponents({ components, onChange, disabled }: {
  components: AreaComponent[]; onChange: (value: AreaComponent[]) => void; disabled: boolean;
}) {
  const t = useTranslations("ProjectWorkspace.directions.components"), locale = useLocale();
  const update = (index: number, change: Partial<AreaComponent>) => onChange(components.map((item, position) => position === index ? { ...item, ...change } : item));
  return <div className="space-y-4 pb-2" data-direction-components>
    {components.map((component, index) => {
      const equivalent = equivalentArea(Number(component.actualArea.replace(",", ".")), Number(component.coefficient.replace(",", ".")));
      return <fieldset key={index} disabled={disabled} className="space-y-3 border-b border-[var(--ui-border-subtle)] pb-4 last:border-0 last:pb-0">
        <legend className="sr-only">{t("position", { number: index + 1 })}</legend>
        <div className="flex items-end gap-2"><FormField label={t("name")} className="min-w-0 flex-1"><Input value={component.name} aria-label={t("positionName", { number: index + 1 })} onChange={event => update(index, { name: event.target.value })} maxLength={2000} required/></FormField><Button type="button" variant="ghost" className="size-11 shrink-0 p-0" aria-label={t("remove", { number: index + 1 })} onClick={() => onChange(components.filter((_, position) => position !== index))}><Trash2 className="size-4" aria-hidden="true"/></Button></div>
        <div className="grid grid-cols-2 items-end gap-3"><FormField label={t("area")} className="self-end"><DecimalInput value={component.actualArea} aria-label={t("positionArea", { number: index + 1 })} onChange={event => update(index, { actualArea: event.target.value })} required/></FormField><FormField label={t("coefficient")} className="self-end"><DecimalInput value={component.coefficient} aria-label={t("positionCoefficient", { number: index + 1 })} onChange={event => update(index, { coefficient: event.target.value })} required/></FormField></div>
        <p className="text-right text-xs text-[var(--ui-text-secondary)]">{t("equivalent")}: <output className="ui-numeric font-medium">{equivalent === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(equivalent)}</output> м²</p>
      </fieldset>;
    })}
  </div>;
}
