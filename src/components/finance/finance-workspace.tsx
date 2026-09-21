"use client";

import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceFoundation } from "@/app/(app)/finance/actions";
import { FinanceCurrencySelect } from "@/components/finance/currency-select";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, inputClassName } from "@/components/ui/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateOnly } from "@/lib/utils";
import { formatFinanceAmount, type FinanceAccount, type FinanceActionState, type FinanceCurrency, type FinanceSettings } from "@/lib/finance";
import type { getFinanceData } from "@/data/queries/finance";

const initialState: FinanceActionState = { status: "idle" };
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";

function FinanceForm({ children, label, onSaved, onPendingChange, secondary = false }: { children: ReactNode; label: string; onSaved?: () => void; onPendingChange?: (pending: boolean) => void; secondary?: boolean }) {
  const t = useTranslations("Finance");
  const [state, action, pending] = useActionState(async (previous: FinanceActionState, form: FormData) => {
    onPendingChange?.(true);
    try {
      const result = await saveFinanceFoundation(previous, form);
      if (result.status === "success") onSaved?.();
      return result;
    } catch {
      return { status: "error", message: t("errors.save") } satisfies FinanceActionState;
    } finally {
      onPendingChange?.(false);
    }
  }, initialState);
  return <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4">
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      {children}
      <Button type="submit" variant={secondary ? "outline" : "default"} disabled={pending}>{pending ? t("saving") : label}</Button>
    </fieldset>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text-secondary)]"}`}>{state.message}</p> : null}
  </form>;
}

function SettingsForm({ settings, currencies, today }: { settings: FinanceSettings | null; currencies: FinanceCurrency[]; today: string }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const [currency, setCurrency] = useState(settings?.base_currency ?? "UAH");
  const [cutoverDate, setCutoverDate] = useState(settings?.cutover_date ?? today);
  return <FinanceForm label={t("saveSettings")}>
    <input type="hidden" name="intent" value="settings" />
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label={t("baseCurrency")}><FinanceCurrencySelect currencies={currencies} name="baseCurrency" value={currency} reportingCurrency={currency} onValueChange={setCurrency} /></FormField>
      <FormField label={t("cutoverDate")}><DatePicker aria-label={t("cutoverDate")} name="cutoverDate" value={cutoverDate} onValueChange={setCutoverDate} locale={locale} required /></FormField>
    </div>
    <p className="text-sm text-[var(--ui-text-muted)]">{t("cutoverHelp")}</p>
  </FinanceForm>;
}

function AccountForm({ account, settings, currencies, onSaved, onPendingChange }: { account: FinanceAccount | null; settings: FinanceSettings; currencies: FinanceCurrency[]; onSaved: () => void; onPendingChange: (pending: boolean) => void }) {
  const t = useTranslations("Finance");
  const [requestId] = useState(() => crypto.randomUUID());
  const [currency, setCurrency] = useState(account?.currency ?? settings.base_currency);
  const locked = Boolean(settings.finalized_at);
  const precision = currencies.find((entry) => entry.code === currency)?.minor_units ?? 2;
  return <FinanceForm label={t("saveAccount")} onSaved={onSaved} onPendingChange={onPendingChange}>
    <input type="hidden" name="intent" value="account" />
    <input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="accountId" value={account?.id ?? ""} />
    <FormField label={t("accountName")}><Input name="name" defaultValue={account?.name ?? ""} required maxLength={120} autoComplete="off" data-dialog-initial-focus /></FormField>
    <FormField label={t("currency")}>{locked && account ? <><Input value={currency} readOnly aria-label={t("currency")} /><input type="hidden" name="currency" value={currency} /></> : <FinanceCurrencySelect currencies={currencies} name="currency" value={currency} reportingCurrency={settings.base_currency} onValueChange={setCurrency} />}</FormField>
    {locked && !account ? <input type="hidden" name="openingBalance" value="0"/> : <><FormField label={t("openingBalance")}>
      <Input name="openingBalance" inputMode="decimal" defaultValue={String(account?.opening_balance ?? 0)} readOnly={locked} required aria-describedby="finance-balance-help" />
    </FormField>
    <p id="finance-balance-help" className="text-sm text-[var(--ui-text-muted)]">{locked ? t("openingLockedHelp") : t("openingHelp", { digits: precision })}</p></>}
  </FinanceForm>;
}

function AccountArchiveForm({ account }: { account: FinanceAccount }) {
  const t = useTranslations("Finance");
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: FinanceActionState, form: FormData) => {
    const result = await saveFinanceFoundation(previous, form);
    if (result.status === "success") router.refresh();
    return result;
  }, initialState);
  const restoring = Boolean(account.archived_at);
  return <form action={action} className="relative"><input type="hidden" name="intent" value={restoring ? "restore" : "archive"}/><input type="hidden" name="accountId" value={account.id}/><Button type="submit" size="sm" variant="ghost" disabled={pending} className="size-11 p-0 md:size-9" aria-label={t(restoring ? "restoreNamed" : "archiveNamed", { name: account.name })}>{restoring ? <RotateCcw className="size-4" aria-hidden="true"/> : <Archive className="size-4" aria-hidden="true"/>}</Button>{state.status === "error" && state.message ? <span role="alert" className="absolute right-0 top-full z-10 mt-1 w-64 rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-surface)] p-2 text-xs text-[var(--ui-danger-text)] shadow-[var(--ui-shadow-popover)]">{state.message}</span> : null}</form>;
}

function OpeningValuationForm({ account, settings, onSaved, onPendingChange }: { account: FinanceAccount; settings: FinanceSettings; onSaved: () => void; onPendingChange: (pending: boolean) => void }) {
  const t = useTranslations("Finance");
  const [mode, setMode] = useState(account.opening_fx_source ?? (settings.base_currency === "UAH" ? "nbu" : "manual"));
  return <FinanceForm label={t("openingFx.save")} onSaved={onSaved} onPendingChange={onPendingChange}>
    <input type="hidden" name="intent" value="opening-valuation" /><input type="hidden" name="accountId" value={account.id} />
    <input type="hidden" name="currency" value={account.currency} /><input type="hidden" name="reportingCurrency" value={settings.base_currency} />
    <input type="hidden" name="openingAmount" value={String(account.opening_balance)} /><input type="hidden" name="date" value={settings.cutover_date} />
    <p className="text-sm">{account.name} · {account.opening_balance} {account.currency} · {settings.cutover_date}</p>
    <FormField label={t("movements.valuation", { currency: account.currency, base: settings.base_currency })}><select aria-label={t("movements.valuation", { currency: account.currency, base: settings.base_currency })} className={inputClassName} name="fxMode" value={mode} onChange={event => setMode(event.target.value)}>
      {settings.base_currency === "UAH" ? <option value="nbu">{t("movements.nbu")}</option> : null}<option value="manual">{t("movements.manual")}</option>
    </select></FormField>
    {mode === "manual" ? <FormField label={t("movements.rate", { currency: account.currency, base: settings.base_currency })}><Input name="manualRate" inputMode="decimal" defaultValue={account.opening_fx_rate ?? ""} required autoComplete="off" /></FormField> : <p className="text-sm text-[var(--ui-text-muted)]">{t("openingFx.nbu", { date: settings.cutover_date })}</p>}
    {settings.finalized_at ? <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirmed" required className="mt-1" /><span>{t("openingFx.confirm")}</span></label> : null}
  </FinanceForm>;
}

export function FinanceWorkspace({ settings, accounts, currencies, balances, today }: { settings: FinanceSettings | null; accounts: FinanceAccount[]; currencies: FinanceCurrency[]; balances: NonNullable<Awaited<ReturnType<typeof getFinanceData>>>["balances"]; today: string }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const [editor, setEditor] = useState<string | null>(null);
  const [valuing, setValuing] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [dialogPending, setDialogPending] = useState(false);
  const locked = Boolean(settings?.finalized_at);
  const selectedAccount = accounts.find((account) => account.id === editor) ?? null;
  const valuationAccount = accounts.find(account => account.id === valuing);
  const missingValuations = accounts.filter(account => account.currency !== settings?.base_currency && account.opening_balance !== 0 && account.opening_reporting_amount === null);
  const active = accounts.filter((account) => !account.archived_at);
  const archived = accounts.filter((account) => account.archived_at);

  function accountRow(account: FinanceAccount) {
    const currency = currencies.find((entry) => entry.code === account.currency);
    const reportingCurrency = currencies.find(entry => entry.code === settings?.base_currency);
    const needsFx = account.currency !== settings?.base_currency && account.opening_balance !== 0;
    const balance = balances.find((entry) => entry.id === account.id)?.recorded_balance;
    return <li key={account.id} className="group px-4 py-2.5 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)] motion-reduce:transition-none sm:px-5">
      <div className="flex min-h-12 items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-[var(--ui-text)]">{account.name}{account.archived_at ? <span className="ml-2 rounded-full bg-[var(--ui-surface-muted)] px-2 py-0.5 text-xs font-normal text-[var(--ui-text-muted)]">{t("movements.archived")}</span> : null}</p>
        <p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{account.currency}</p>
        {needsFx && account.opening_reporting_amount === null ? <p className="mt-1 text-xs text-[var(--ui-warning-text)]">{t("openingFx.missing")}</p> : null}
      </div>
      {settings?.finalized_at ? <div className="shrink-0 text-right"><p className="ui-numeric text-sm font-semibold text-[var(--ui-text)]">{currency && balance !== null && balance !== undefined ? formatFinanceAmount(balance, currency, locale) : "—"}</p><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{t("movements.recordedBalance")}</p></div> : null}
      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity duration-150 motion-reduce:transition-none md:pointer-fine:opacity-0 md:pointer-fine:group-hover:opacity-100 md:pointer-fine:group-focus-within:opacity-100">
        {needsFx && (!locked || account.opening_reporting_amount === null) ? <Button size="sm" variant="outline" className="min-h-11 md:min-h-9" aria-label={t("openingFx.named", { name: account.name })} onClick={() => setValuing(account.id)}>{t(account.opening_reporting_amount === null ? "openingFx.value" : "openingFx.edit")}</Button> : null}
        {!account.archived_at ? <Button type="button" size="sm" variant="ghost" className="size-11 p-0 md:size-9" aria-label={t("editNamed", { name: account.name })} onClick={() => setEditor(account.id)}><Pencil className="size-4" aria-hidden="true"/></Button> : null}
        <AccountArchiveForm account={account}/>
      </div>
      </div>
      <details className="ml-0 mt-0.5 text-xs text-[var(--ui-text-muted)]"><summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("openingDetails")}</summary><div className="space-y-1 pb-1 pt-1"><p>{t("openingBalance")} · <span className="ui-numeric">{currency ? formatFinanceAmount(account.opening_balance, currency, locale) : `${account.opening_balance} ${account.currency}`}</span></p>{needsFx && account.opening_reporting_amount !== null ? <p>{t("openingFx.value")} · {reportingCurrency ? formatFinanceAmount(account.opening_reporting_amount, reportingCurrency, locale) : "—"} · {account.opening_fx_rate} {settings?.base_currency} / {account.currency} · {t(account.opening_fx_source === "nbu" ? "movements.nbu" : "movements.manual")} · {account.opening_fx_effective_date}</p> : null}</div></details>
    </li>;
  }

  return <div className="mx-auto w-full max-w-[var(--finance-content-width,80rem)] space-y-6">
    <PageHeader className="items-start max-sm:flex-col" title={locked ? t("accounts") : t("title")} description={locked ? t("accountsHelp") : t("description")} action={settings ? <Button className="gap-1.5" onClick={() => setEditor("new")}><Plus className="size-4" aria-hidden="true"/>{t("addAccount")}</Button> : null}/>
    {locked && settings ? <details className={`${panel} px-4 py-3 text-sm`}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span>{t("settings")}</span><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("finalized")}</span></summary><div className="mt-3 border-t border-[var(--ui-border)] pt-3"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-[var(--ui-text-muted)]">{t("baseCurrency")}</dt><dd className="mt-0.5 font-medium">{settings.base_currency}</dd></div><div><dt className="text-xs text-[var(--ui-text-muted)]">{t("cutoverDate")}</dt><dd className="mt-0.5 font-medium">{formatDateOnly(settings.cutover_date, locale)}</dd></div></dl><p className="mt-3 text-xs text-[var(--ui-text-muted)]">{t("finalizedHelp")}</p></div></details> : <section className={`${panel} space-y-4 p-4 sm:p-5`} aria-labelledby="finance-settings-title"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="finance-settings-title" className="font-semibold text-[var(--ui-text)]">{t("settings")}</h2><span className="text-sm text-[var(--ui-text-muted)]">{t("draft")}</span></div><SettingsForm key={settings?.updated_at ?? "new"} settings={settings} currencies={currencies} today={today}/></section>}

    {missingValuations.length ? <p role="status" className={`${panel} p-4 text-sm`}>{t(locked ? "openingFx.legacy" : "openingFx.required")}</p> : null}
    <section className={panel} aria-label={locked ? t("accounts") : undefined} aria-labelledby={locked ? undefined : "finance-accounts-title"}>
      {!locked ? <div className="border-b border-[var(--ui-border)] p-4 sm:p-5"><h2 id="finance-accounts-title" className="font-semibold text-[var(--ui-text)]">{t("accounts")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("accountsHelp")}</p></div> : null}
      {active.length ? <ul className="divide-y divide-[var(--ui-border)]">{active.map(accountRow)}</ul> : <p className="p-5 text-sm text-[var(--ui-text-muted)]">{settings ? t("emptyAccounts") : t("setupFirst")}</p>}
      {archived.length ? <details className="border-t border-[var(--ui-border)]"><summary className="cursor-pointer px-5 py-4 text-sm font-medium">{t("archivedAccounts", { count: archived.length })}</summary><p className="px-5 pb-3 text-sm text-[var(--ui-text-muted)]">{t("archivedHelp")}</p><ul className="divide-y divide-[var(--ui-border)]">{archived.map(accountRow)}</ul></details> : null}
    </section>

    {settings && !locked ? <section className={`${panel} space-y-3 p-4 sm:p-5`} aria-labelledby="finance-finalize-title"><h2 id="finance-finalize-title" className="font-semibold">{t("finalizeTitle")}</h2><p className="text-sm text-[var(--ui-text-secondary)]">{t("finalizeHelp")}</p><Button variant="outline" disabled={!active.length || missingValuations.length > 0} onClick={() => setFinalizing(true)}>{t("reviewFinalize")}</Button></section> : null}

    <Dialog isOpen={valuing !== null} closeDisabled={dialogPending} onRequestClose={() => setValuing(null)} title={t("openingFx.value")} closeLabel={t("close")}>
      {settings && valuationAccount ? <div className="p-5"><OpeningValuationForm key={`${valuationAccount.id}:${valuationAccount.updated_at}:${settings.base_currency}:${settings.cutover_date}`} account={valuationAccount} settings={settings} onSaved={() => setValuing(null)} onPendingChange={setDialogPending} /></div> : null}
    </Dialog>
    <Dialog isOpen={editor !== null} closeDisabled={dialogPending} onRequestClose={() => setEditor(null)} title={selectedAccount ? t("editAccount") : t("addAccount")} closeLabel={t("close")}>
      {settings && editor !== null ? <div className="p-5"><AccountForm key={editor === "new" ? editor : `${editor}:${settings.finalized_at ?? "draft"}`} account={selectedAccount} settings={settings} currencies={currencies} onSaved={() => setEditor(null)} onPendingChange={setDialogPending} /></div> : null}
    </Dialog>
    <Dialog isOpen={finalizing && !locked} closeDisabled={dialogPending} onRequestClose={() => setFinalizing(false)} title={t("finalizeTitle")} closeLabel={t("close")}>
      {finalizing ? <div className="space-y-4 p-5"><p className="text-sm text-[var(--ui-text-secondary)]">{t("finalizeHelp")}</p><FinanceForm label={t("finalize")} onSaved={() => setFinalizing(false)} onPendingChange={setDialogPending}><input type="hidden" name="intent" value="finalize" /><label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4 shrink-0 accent-[var(--ui-action-primary)]" type="checkbox" name="confirmed" required /><span>{t("confirmFinalize")}</span></label></FinanceForm></div> : null}
    </Dialog>
  </div>;
}
