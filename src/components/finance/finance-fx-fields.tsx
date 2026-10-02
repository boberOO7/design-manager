"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";

export function FinanceFxFields({ currency, base, destination = false, namePrefix = "", opening = false }: { currency: string; base: string; destination?: boolean; namePrefix?: string; opening?: boolean }) {
  const t = useTranslations("Finance");
  const [mode, setMode] = useState(opening && base !== "UAH" ? "manual" : "nbu");
  if (currency === base || !currency) return null;
  return <div className="space-y-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3">
    <FormField label={t("movements.valuation", { currency, base })}>
      <Select aria-label={t("movements.valuation", { currency, base })} name={`${namePrefix}${destination ? "destinationFxMode" : "fxMode"}`} value={mode} onValueChange={setMode}>
        {!opening || base === "UAH" ? <SelectItem value="nbu">{t("movements.nbu")}</SelectItem> : null}
        <SelectItem value="manual">{t("movements.manual")}</SelectItem>
      </Select>
    </FormField>
    {mode === "manual" ? <FormField label={t("movements.rate", { currency, base })}><Input name={`${namePrefix}${destination ? "destinationManualRate" : "manualRate"}`} inputMode="decimal" required autoComplete="off" /></FormField> : <p className="text-sm text-[var(--ui-text-muted)]">{t("movements.nbuHelp")}</p>}
  </div>;
}

