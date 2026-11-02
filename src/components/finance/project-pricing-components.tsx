"use client";
import { componentAreaValue } from "@/lib/work-direction-components";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { FormField, Input } from "@/components/ui/form-field";
import { projectAreaComponentsValue, projectAreaValue, type ProjectAreaComponent } from "@/lib/finance-project-plan";

export function ProjectPricingComponents({ components, onChange, rate, digits, money, controlClass, active }: {
  components: ProjectAreaComponent[]; onChange: (value: ProjectAreaComponent[]) => void;
  rate: string; digits: number; money: (value: string) => string; controlClass: string; active: boolean;
}) {
  const t = useTranslations("Finance.builder.components");
  const host = useRef<HTMLDivElement>(null), previousCount = useRef(components.length);
  useEffect(() => {
    const added = components.length > previousCount.current;
    previousCount.current = components.length;
    if (!added || !active) return;
    let frame: number;
    const focus = () => {
      const input = host.current?.querySelector<HTMLInputElement>(":scope > fieldset:last-child input");
      if (!input) return;
      // CSS visibility stays hidden while the opening transition is running.
      if (getComputedStyle(input).visibility !== "visible") { frame = requestAnimationFrame(focus); return; }
      input.focus();
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [components.length, active]);
  let amounts: string[] = [];
  try { amounts = projectAreaComponentsValue(components, rate, digits).items.map(item => item.amount); } catch { /* Incomplete rows remain editable. */ }
  const update = (index: number, value: Partial<ProjectAreaComponent>) => onChange(components.map((item, position) => position === index ? { ...item, ...value } : item));
  return <div ref={host} className="space-y-4" data-pricing-components>
    {components.map((component, index) => {
      let amount = amounts[index] ?? "";
      if (!amount) try { amount = projectAreaValue(componentAreaValue(component.actualArea, component.coefficient, 4), rate, digits); } catch { /* Empty numeric inputs have no preview. */ }
      return <fieldset key={index} disabled={!active} className="min-w-0 space-y-2 border-b border-[var(--ui-border-subtle)] pb-3 last:border-0 last:pb-0">
        <legend className="sr-only">{t("position", { number: index + 1 })}</legend>
        <div className="flex items-end gap-2">
          <FormField label={t("name")} className="min-w-0 flex-1"><Input aria-label={t("positionName", { number: index + 1 })} value={component.name} onChange={event => update(index, { name: event.target.value })} required maxLength={2000} className={controlClass}/></FormField>
          <Button type="button" variant="ghost" size="sm" className="mb-0.5 size-11 shrink-0 px-0 text-[var(--ui-text-muted)] sm:size-9" aria-label={t("remove", { number: index + 1 })} onClick={() => onChange(components.filter((_, position) => position !== index))}><Trash2 className="size-4" aria-hidden="true"/></Button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,.8fr)_minmax(0,1fr)] items-end gap-3">
          <FormField label={t("actualArea")} className="self-end"><DecimalInput aria-label={t("positionArea", { number: index + 1 })} value={component.actualArea} onChange={event => update(index, { actualArea: event.target.value })} required className={controlClass}/></FormField>
          <FormField label={t("coefficient")} className="self-end"><DecimalInput aria-label={t("positionCoefficient", { number: index + 1 })} value={component.coefficient} onChange={event => update(index, { coefficient: event.target.value })} required className={controlClass}/></FormField>
          <div className="min-w-0 pb-2 text-right"><span className="block text-xs text-[var(--ui-text-muted)]">{t("amount")}</span><output className="ui-numeric mt-2 block text-sm font-medium" aria-label={t("positionAmount", { number: index + 1 })}>{amount ? money(amount) : "—"}</output></div>
        </div>
      </fieldset>;
    })}
  </div>;
}
