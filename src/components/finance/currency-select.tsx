"use client";

import { useTranslations } from "next-intl";
import { Select, SelectGroup, SelectItem } from "@/components/ui/select";
import type { FinanceCurrency } from "@/lib/finance";

export const COMMON_FINANCE_CURRENCY_CODES = ["UAH", "USD", "EUR", "PLN"] as const;

export function groupFinanceCurrencies(currencies: FinanceCurrency[], reportingCurrency: string) {
  const byCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const reporting = COMMON_FINANCE_CURRENCY_CODES.includes(reportingCurrency as typeof COMMON_FINANCE_CURRENCY_CODES[number])
    ? []
    : [byCode.get(reportingCurrency)].filter((currency): currency is FinanceCurrency => Boolean(currency));
  const common = [reportingCurrency, ...COMMON_FINANCE_CURRENCY_CODES]
    .filter((code, index, codes) => codes.indexOf(code) === index)
    .filter((code) => COMMON_FINANCE_CURRENCY_CODES.includes(code as typeof COMMON_FINANCE_CURRENCY_CODES[number]))
    .map((code) => byCode.get(code))
    .filter((currency): currency is FinanceCurrency => Boolean(currency));
  const prioritized = new Set([...reporting, ...common].map((currency) => currency.code));
  const other = currencies.filter((currency) => !prioritized.has(currency.code));
  return { reporting, common, other };
}

export function FinanceCurrencySelect({ currencies, name, onValueChange, reportingCurrency, value }: {
  currencies: FinanceCurrency[];
  name: string;
  onValueChange: (value: string) => void;
  reportingCurrency: string;
  value: string;
}) {
  const t = useTranslations("Finance");
  const groups = groupFinanceCurrencies(currencies, reportingCurrency);
  const items = (group: FinanceCurrency[]) => group.map((currency) => <SelectItem key={currency.code} value={currency.code}>{currency.code}</SelectItem>);
  return <Select aria-label={name === "baseCurrency" ? t("baseCurrency") : t("currency")} name={name} value={value} onValueChange={onValueChange} required searchPlaceholder={t("searchCurrencies")} searchEmptyMessage={t("currencySearchEmpty")}>
    {groups.reporting.length ? <SelectGroup label={t("reportingCurrencyGroup")}>{items(groups.reporting)}</SelectGroup> : null}
    <SelectGroup label={t("commonCurrencies")}>{items(groups.common)}</SelectGroup>
    <SelectGroup label={t("otherCurrencies")}>{items(groups.other)}</SelectGroup>
  </Select>;
}
