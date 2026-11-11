"use client";

import * as Popover from "@radix-ui/react-popover";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Info, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, FormField, focusVisibleClassName } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Tooltip } from "@/components/ui/tooltip";
import { AnimatedFormContent } from "@/components/ui/animated-form-content";
import { financeCategoryLabel } from "@/lib/finance-planning";
import { emptyMovementFilters, hasMovementFilters, movementFilterKinds, movementFiltersHref, type FinanceMovementFilters } from "@/lib/finance-movement-filters";
import { formatDateOnly } from "@/lib/utils";
import type { getFinanceData } from "@/data/queries/finance";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
const filterControl = "h-11 text-sm font-normal sm:h-9";
export function MovementFilters({ filters, accounts, categories, currencies, total, today }: Pick<Foundation, "accounts" | "categories" | "currencies"> & { filters: FinanceMovementFilters; total: number; today: string }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const accountControl = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState(filters.q);
  const [period, setPeriod] = useState(filters.period);
  const [from, setFrom] = useState(filters.from || `${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(filters.to || today);
  useEffect(() => { setQuery(filters.q); }, [filters.q]);
  useEffect(() => { setPeriod(filters.period); setFrom(filters.from || `${today.slice(0, 7)}-01`); setTo(filters.to || today); }, [filters.period, filters.from, filters.to, today]);
  function navigate(next: FinanceMovementFilters) {
    const href = movementFiltersHref(next);
    if (`${window.location.pathname}${window.location.search}` === href) return;
    startTransition(() => router.push(href, { scroll: false }));
  }
  function update(patch: Partial<FinanceMovementFilters>) { navigate({ ...filters, q: query.trim(), ...patch }); }
  const categoryLabel = (id: string) => {
    const category = categories.find(item => item.id === id);
    return id === "none" ? t("movements.filters.noCategory") : category ? financeCategoryLabel(category, category.name, key => t(`planning.defaults.${key}`)) : t("movements.filters.unavailableCategory");
  };
  const archived = (value: { archived_at: string | null }) => value.archived_at ? ` · ${t("movements.archived")}` : "";
  const accountLabel = (id: string) => {
    const account = accounts.find(item => item.id === id);
    return account ? `${account.name} · ${account.currency}${archived(account)}` : t("movements.filters.unavailableAccount");
  };
  const usedCurrencies = new Set(accounts.map(account => account.currency));
  const moreCount = Number(Boolean(filters.account)) + Number(Boolean(filters.kind)) + Number(filters.history);
  const chips: { key: string; label: string; remove: Partial<FinanceMovementFilters> }[] = [];
  if (filters.q) chips.push({ key: "q", label: filters.q, remove: { q: "" } });
  if (filters.category) chips.push({ key: "category", label: categoryLabel(filters.category), remove: { category: "" } });
  if (filters.currency) chips.push({ key: "currency", label: filters.currency, remove: { currency: "" } });
  if (filters.period !== "all") chips.push({ key: "period", label: filters.period === "custom" ? `${filters.from ? formatDateOnly(filters.from, locale) : "…"} — ${filters.to ? formatDateOnly(filters.to, locale) : "…"}` : t(`movements.filters.periods.${filters.period}`), remove: { period: "all", from: "", to: "" } });
  if (filters.account) chips.push({ key: "account", label: accountLabel(filters.account), remove: { account: "" } });
  if (filters.kind) chips.push({ key: "kind", label: t(`movements.kinds.${filters.kind}`), remove: { kind: "" } });
  if (filters.history) chips.push({ key: "history", label: t("movements.filters.historyActive"), remove: { history: false } });
  return <section aria-label={t("movements.filters.title")} aria-busy={pending} className="space-y-2">
    <div className="grid w-full grid-cols-2 items-center gap-2 lg:grid-cols-[minmax(12rem,1.5fr)_minmax(11rem,1fr)_minmax(9.5rem,.5fr)_minmax(12.5rem,.8fr)_auto]">
      <form role="search" className="relative col-span-2 min-w-0 lg:col-span-1" onSubmit={event => { event.preventDefault(); update({ q: query.trim() }); }}>
        <label className="sr-only" htmlFor="movement-search">{t("movements.filters.searchLabel")}</label>
        <Input id="movement-search" type="search" maxLength={200} placeholder={t("movements.filters.searchPlaceholder")} value={query} disabled={pending} onChange={event => { setQuery(event.target.value); if (!event.target.value && filters.q) update({ q: "" }); }} className="h-11 pr-11 sm:h-9" />
        <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label={t("movements.filters.search")} className="absolute right-0 top-0 h-full w-10 px-0"><Search className="size-4" aria-hidden="true" /></Button>
      </form>
      <Select className={filterControl} aria-label={t("movements.category")} value={filters.category} disabled={pending} onValueChange={category => update({ category })} searchPlaceholder={t("movements.filters.searchCategories")}>
        <SelectItem value="">{t("movements.filters.allCategories")}</SelectItem>
        <SelectItem value="none">{t("movements.filters.noCategory")}</SelectItem>
        {categories.map(category => <SelectItem key={category.id} value={category.id}>{categoryLabel(category.id)}{archived(category)}</SelectItem>)}
      </Select>
      <Select className={filterControl} aria-label={t("currency")} value={filters.currency} disabled={pending} onValueChange={currency => update({ currency })}>
        <SelectItem value="">{t("movements.filters.allCurrencies")}</SelectItem>
        {currencies.filter(currency => usedCurrencies.has(currency.code) || currency.code === filters.currency).map(currency => <SelectItem key={currency.code} value={currency.code}>{currency.code}</SelectItem>)}
      </Select>
      <Select className={filterControl} aria-label={t("movements.filters.period")} value={period} disabled={pending} onValueChange={value => {
        const next = (["all", "month", "previous", "custom"] as const).find(item => item === value) ?? "all";
        setPeriod(next);
        if (next !== "custom") update({ period: next, from: "", to: "" });
      }}>
        {(["all", "month", "previous", "custom"] as const).map(value => <SelectItem key={value} value={value}>{t(`movements.filters.periods.${value}`)}</SelectItem>)}
      </Select>
      <Popover.Root>
        <Popover.Trigger asChild><Button variant="outline" size="compact" className="gap-2" disabled={pending}><SlidersHorizontal className="size-4" aria-hidden="true" />{t("movements.filters.more")}{moreCount ? <span className="ui-numeric">· {moreCount}</span> : null}</Button></Popover.Trigger>
        <Popover.Portal><Popover.Content align="end" sideOffset={8} collisionPadding={12} aria-label={t("movements.filters.more")} onOpenAutoFocus={event => { event.preventDefault(); accountControl.current?.focus(); }} className="z-[80] w-[min(22rem,calc(100vw-2rem))] space-y-4 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-popover)]">
          <FormField as="div" label={<span className="flex items-center gap-1.5">{t("movements.account")}<Tooltip openOnClick content={t("movements.filters.entryHelp")}><Button variant="ghost" size="sm" className="size-6 p-0" aria-label={t("movements.filters.aboutEntryFilters")}><Info className="size-3.5" aria-hidden="true" /></Button></Tooltip></span>}><Select ref={accountControl} className={filterControl} aria-label={t("movements.account")} value={filters.account} disabled={pending} onValueChange={account => update({ account })} searchPlaceholder={t("movements.filters.searchAccounts")}><SelectItem value="">{t("movements.filters.allAccounts")}</SelectItem>{accounts.map(account => <SelectItem key={account.id} value={account.id}>{accountLabel(account.id)}</SelectItem>)}</Select></FormField>
          <FormField as="div" label={t("movements.type")}><Select className={filterControl} aria-label={t("movements.type")} value={filters.kind} disabled={pending} onValueChange={value => update({ kind: movementFilterKinds.find(kind => kind === value) ?? "" })}><SelectItem value="">{t("movements.filters.allKinds")}</SelectItem>{movementFilterKinds.map(kind => <SelectItem key={kind} value={kind}>{t(`movements.kinds.${kind}`)}</SelectItem>)}</Select></FormField>
          <div className="border-t border-[var(--ui-border)] pt-2"><label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm font-normal leading-5 text-[var(--ui-text)]"><input type="checkbox" className={`size-4 shrink-0 accent-[var(--ui-action-primary)] ${focusVisibleClassName}`} checked={filters.history} disabled={pending} onChange={event => update({ history: event.target.checked })} /><span>{t("movements.filters.showHistory")}</span></label></div>
        </Popover.Content></Popover.Portal>
      </Popover.Root>
    </div>
    <AnimatedFormContent isOpen={period === "custom"}>
      <form className="flex flex-wrap items-end gap-2 pt-1" onSubmit={event => { event.preventDefault(); if (from && to && from <= to) update({ period: "custom", from, to }); }}>
        <FormField as="div" className="min-w-0 flex-1 sm:max-w-48" label={t("movements.filters.from")}><DatePicker aria-label={t("movements.filters.from")} value={from} onValueChange={setFrom} locale={locale} required /></FormField>
        <FormField as="div" className="min-w-0 flex-1 sm:max-w-48" label={t("movements.filters.to")}><DatePicker aria-label={t("movements.filters.to")} value={to} min={from || undefined} onValueChange={setTo} locale={locale} required /></FormField>
        <Button type="submit" variant="outline" size="compact" disabled={pending || !from || !to || from > to}>{t("movements.filters.applyRange")}</Button>
        {from && to && from > to ? <p role="alert" className="w-full text-sm text-[var(--ui-danger-text)]">{t("movements.filters.invalidRange")}</p> : null}
      </form>
    </AnimatedFormContent>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {chips.map(chip => <Tooltip key={chip.key} content={chip.label}><Button variant="ghost" size="sm" disabled={pending} className="max-w-full gap-1.5 bg-[var(--ui-surface-muted)] font-normal" aria-label={t("movements.filters.remove", { name: chip.label })} onClick={() => update(chip.remove)}><span className="max-w-64 truncate">{chip.label}</span><X className="size-3.5 shrink-0" aria-hidden="true" /></Button></Tooltip>)}
      {hasMovementFilters(filters) ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setQuery(""); setPeriod("all"); navigate(emptyMovementFilters); }}>{t("movements.filters.reset")}</Button> : null}
      <p role="status" aria-atomic="true" className="ml-auto py-1 text-xs text-[var(--ui-text-muted)]">{pending ? t("movements.filters.loading") : t("movements.filters.results", { count: total })}</p>
    </div>
  </section>;
}
