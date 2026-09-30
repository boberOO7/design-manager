"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select, SelectItem } from "@/components/ui/select";
import { financeDisplayCurrencySchema, type FinanceDisplayCurrency } from "@/lib/finance-display-currency";

export function DisplayCurrencySelect({ value }: { value: FinanceDisplayCurrency }) {
  const t = useTranslations("Finance");
  const router = useRouter();
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);
  async function change(currency: string) {
    const parsed = financeDisplayCurrencySchema.safeParse(currency);
    if (!parsed.success) return;
    setSaving(true);
    try {
      const response = await fetch("/api/finance/display-currency", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency: parsed.data }) });
      if (!response.ok) throw new Error("currency");
      setSelected(parsed.data);
      router.refresh();
    } catch { setSelected(value); } finally { setSaving(false); }
  }
  return <Select aria-label={t("displayCurrency")} size="compact" className="w-24" value={selected} disabled={saving} onValueChange={change}>
    {financeDisplayCurrencySchema.options.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}
  </Select>;
}
