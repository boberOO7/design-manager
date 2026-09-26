"use client";

import * as Popover from "@radix-ui/react-popover";
import { Archive, MoreHorizontal, Pencil, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceFoundation } from "@/app/(app)/finance/actions";
import { FinanceCurrencySelect } from "@/components/finance/currency-select";
import { FinanceFxFields } from "@/components/finance/finance-fx-fields";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Textarea, inputClassName } from "@/components/ui/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateOnly } from "@/lib/utils";
import { financeAccountTypeSchema, financeAmountText, financeAmountUnits, formatFinanceAmount, type FinanceAccount, type FinanceActionState, type FinanceCurrency, type FinanceSettings } from "@/lib/finance";
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

function AccountForm({ account, settings, currencies, today, onSaved, onPendingChange }: { account: FinanceAccount | null; settings: FinanceSettings; currencies: FinanceCurrency[]; today: string; onSaved: () => void; onPendingChange: (pending: boolean) => void }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const [requestId] = useState(() => crypto.randomUUID());
  const [currency, setCurrency] = useState(account?.currency ?? settings.base_currency);
  const [openingBalance, setOpeningBalance] = useState(String(account?.opening_balance ?? 0));
  const [date, setDate] = useState(today);
  const locked = Boolean(settings.finalized_at);
  const dated = locked && !account;
  const precision = currencies.find((entry) => entry.code === currency)?.minor_units ?? 2;
  return <FinanceForm label={t("saveAccount")} onSaved={onSaved} onPendingChange={onPendingChange}>
    <input type="hidden" name="intent" value={dated ? "account-dated" : "account"} />
    <input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="accountId" value={account?.id ?? ""} />
    <FormField label={t("accountName")}><Input name="name" defaultValue={account?.name ?? ""} required maxLength={120} autoComplete="off" data-dialog-initial-focus /></FormField>
    <FormField label={t("accountType")}><select name="accountType" className={inputClassName} defaultValue={account?.account_type ?? "other"}>{financeAccountTypeSchema.options.map((type) => <option key={type} value={type}>{t(`accountTypes.${type}`)}</option>)}</select></FormField>
    <FormField label={t("currency")}>{locked && account ? <><Input value={currency} readOnly aria-label={t("currency")} /><input type="hidden" name="currency" value={currency} /></> : <FinanceCurrencySelect currencies={currencies} name="currency" value={currency} reportingCurrency={settings.base_currency} onValueChange={setCurrency} />}</FormField>
    <FormField label={t("openingBalance")}><Input name="openingBalance" inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} readOnly={locked && Boolean(account)} required aria-describedby="finance-balance-help" /></FormField>
    <p id="finance-balance-help" className="text-sm text-[var(--ui-text-muted)]">{locked && account ? t("openingLockedHelp") : dated ? t("balance.newOpeningHelp", { digits: precision }) : t("openingHelp", { digits: precision })}</p>
    {dated ? <><FormField label={t("balance.effectiveDate")}><DatePicker name="date" aria-label={t("balance.effectiveDate")} value={date} onValueChange={setDate} min={settings.cutover_date} max={today} locale={locale} required /></FormField>{currency !== settings.base_currency && Number(openingBalance.replace(",", ".")) !== 0 ? <FinanceFxFields key={currency} currency={currency} base={settings.base_currency} /> : null}</> : null}
  </FinanceForm>;
}

function AccountBalanceForm({ account, balance, currency, settings, today, opening, onSaved, onPendingChange }: { account: FinanceAccount; balance: string; currency: FinanceCurrency; settings: FinanceSettings; today: string; opening: boolean; onSaved: () => void; onPendingChange: (pending: boolean) => void }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const [requestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  let difference: string | null = null;
  try { if (amount) difference = financeAmountText(financeAmountUnits(amount.replace(",", "."), currency.minor_units) - financeAmountUnits(balance, currency.minor_units), currency.minor_units); } catch { /* Keep the preview empty until the amount is valid. */ }
  return <FinanceForm label={t(opening ? "balance.saveOpening" : "balance.saveAdjustment")} onSaved={onSaved} onPendingChange={onPendingChange}>
    <input type="hidden" name="intent" value="balance-entry" />
    <input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="accountId" value={account.id} />
    <input type="hidden" name="kind" value={opening ? "account_opening" : "balance_adjustment"} />
    {!opening ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("balance.bookBalance")} · <span className="ui-numeric font-semibold">{formatFinanceAmount(balance, currency, locale)}</span></p> : null}
    <FormField label={t(opening ? "openingBalance" : "balance.actualBalance")}><Input name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required data-dialog-initial-focus /></FormField>
    {!opening ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("balance.difference")} · <span className="ui-numeric font-semibold">{difference === null ? "—" : formatFinanceAmount(difference, currency, locale)}</span></p> : null}
    <FormField label={t("balance.effectiveDate")}><DatePicker name="date" aria-label={t("balance.effectiveDate")} value={date} onValueChange={setDate} min={settings.cutover_date} max={today} locale={locale} required /></FormField>
    {!opening ? <FormField label={t("balance.note")}><Textarea name="note" rows={2} maxLength={2000} /></FormField> : null}
    {currency.code !== settings.base_currency ? <FinanceFxFields currency={currency.code} base={settings.base_currency} /> : null}
  </FinanceForm>;
}
function AccountArchiveForm({ account, menu = false, onSaved }: { account: FinanceAccount; menu?: boolean; onSaved?: () => void }) {
  const t = useTranslations("Finance");
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: FinanceActionState, form: FormData) => {
    const result = await saveFinanceFoundation(previous, form);
    if (result.status === "success") { onSaved?.(); router.refresh(); }
    return result;
  }, initialState);
  const restoring = Boolean(account.archived_at);
  return <form action={action} className="relative"><input type="hidden" name="intent" value={restoring ? "restore" : "archive"}/><input type="hidden" name="accountId" value={account.id}/><Button type="submit" size="sm" variant="ghost" disabled={pending} className={menu ? "min-h-11 h-auto min-w-0 w-full justify-start whitespace-normal break-words py-2 text-left" : "size-11 p-0 md:size-9"} role={menu ? "menuitem" : undefined} aria-label={t(restoring ? "restoreNamed" : "archiveNamed", { name: account.name })}>{menu ? t(restoring ? "restore" : "archive") : restoring ? <RotateCcw className="size-4" aria-hidden="true"/> : <Archive className="size-4" aria-hidden="true"/>}</Button>{state.status === "error" && state.message ? <span role="alert" className="absolute right-0 top-full z-10 mt-1 w-[min(16rem,calc(100vw-1rem))] max-w-full break-words rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-surface)] p-2 text-xs text-[var(--ui-danger-text)] shadow-[var(--ui-shadow-popover)]">{state.message}</span> : null}</form>;
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
  const [balancing, setBalancing] = useState<{ id: string; opening: boolean } | null>(null);
  const [openAccountMenu, setOpenAccountMenu] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [dialogPending, setDialogPending] = useState(false);
  const locked = Boolean(settings?.finalized_at);
  const selectedAccount = accounts.find((account) => account.id === editor) ?? null;
  const valuationAccount = accounts.find(account => account.id === valuing);
  const balanceAccount = accounts.find(account => account.id === balancing?.id);
  const balanceCurrency = currencies.find((currency) => currency.code === balanceAccount?.currency);
  const missingValuations = accounts.filter(account => account.currency !== settings?.base_currency && account.opening_balance !== 0 && account.opening_reporting_amount === null);
  const active = accounts.filter((account) => !account.archived_at);
  const archived = accounts.filter((account) => account.archived_at);

  const totals = currencies.flatMap((currency) => {
    const matching = balances.filter((entry) => entry.currency === currency.code);
    if (!matching.length) return [];
    const units = matching.reduce((sum, entry) => sum + financeAmountUnits(entry.recorded_balance, currency.minor_units), BigInt(0));
    return [{ currency, amount: financeAmountText(units, currency.minor_units) }];
  });

  function accountCard(account: FinanceAccount) {
    const currency = currencies.find((entry) => entry.code === account.currency);
    const reportingCurrency = currencies.find((entry) => entry.code === settings?.base_currency);
    const needsFx = account.currency !== settings?.base_currency && account.opening_balance !== 0;
    const entry = balances.find((item) => item.id === account.id);
    const accountType = financeAccountTypeSchema.safeParse(account.account_type);
    const canSetOpening = locked && !account.archived_at && account.opening_balance === 0 && Number(entry?.ledger_entry_count ?? 0) === 0;
    return <li key={account.id} className={`${panel} min-w-0 self-start p-4 transition-colors hover:border-[var(--ui-border-strong)] motion-reduce:transition-none`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold text-[var(--ui-text)]">{account.name}</h3><p className="min-w-0 break-words text-xs text-[var(--ui-text-muted)] mt-1">{t(`accountTypes.${accountType.success ? accountType.data : "other"}`)} · {account.currency}{account.archived_at ? <span className="ml-2 rounded-full bg-[var(--ui-surface-muted)] px-2 py-0.5">{t("movements.archived")}</span> : null}</p></div>
        <Popover.Root open={openAccountMenu === account.id} onOpenChange={(open) => setOpenAccountMenu((current) => open ? account.id : current === account.id ? null : current)}>
          <Popover.Trigger asChild><button type="button" data-finance-account-menu-trigger aria-label={t("balance.actionsFor", { name: account.name })} aria-haspopup="menu" className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><MoreHorizontal className="size-4" aria-hidden="true" /></button></Popover.Trigger>
          <Popover.Portal><Popover.Content role="menu" align="end" sideOffset={4} collisionPadding={8}
            onInteractOutside={(event) => { if (event.target instanceof Element && event.target.closest("[data-finance-account-menu-trigger]")) event.preventDefault(); }}
            onCloseAutoFocus={(event) => { if (openAccountMenu !== null && openAccountMenu !== account.id) event.preventDefault(); }}
            className={`z-[80] w-[min(13rem,calc(100vw-1rem))] max-h-[var(--radix-popover-content-available-height)] min-w-0 overflow-y-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)] data-[state=open]:animate-[checklist-picker-in_150ms_ease-out_both] ${openAccountMenu !== null && openAccountMenu !== account.id ? "data-[state=closed]:animate-none" : "data-[state=closed]:animate-[checklist-picker-in_100ms_ease-in_reverse_both]"} motion-reduce:animate-none`}>
            {!account.archived_at ? <Button type="button" role="menuitem" size="sm" variant="ghost" className="min-h-11 h-auto min-w-0 w-full justify-start whitespace-normal break-words py-2 text-left" onClick={() => { setOpenAccountMenu(null); setEditor(account.id); }}>{t("edit")}</Button> : null}
            {canSetOpening ? <Button type="button" role="menuitem" size="sm" variant="ghost" className="min-h-11 h-auto min-w-0 w-full justify-start whitespace-normal break-words py-2 text-left" onClick={() => { setOpenAccountMenu(null); setBalancing({ id: account.id, opening: true }); }}>{t("balance.setOpening")}</Button> : null}
            {locked && !account.archived_at ? <Button type="button" role="menuitem" size="sm" variant="ghost" className="min-h-11 h-auto min-w-0 w-full justify-start whitespace-normal break-words py-2 text-left" onClick={() => { setOpenAccountMenu(null); setBalancing({ id: account.id, opening: false }); }}>{t("balance.adjust")}</Button> : null}
            {needsFx && (!locked || account.opening_reporting_amount === null) ? <Button type="button" role="menuitem" size="sm" variant="ghost" className="min-h-11 h-auto min-w-0 w-full justify-start whitespace-normal break-words py-2 text-left" onClick={() => { setOpenAccountMenu(null); setValuing(account.id); }}>{t(account.opening_reporting_amount === null ? "openingFx.value" : "openingFx.edit")}</Button> : null}
            <Popover.Close asChild><Link role="menuitem" href="/finance/movements" className="flex min-h-11 min-w-0 items-center rounded-[var(--ui-radius-control)] px-3 py-2 text-sm text-[var(--ui-text-secondary)] break-words hover:bg-[var(--ui-surface-muted)]">{t("movements.history")}</Link></Popover.Close>
            <AccountArchiveForm account={account} menu onSaved={() => setOpenAccountMenu(null)} />
          </Popover.Content></Popover.Portal>
        </Popover.Root>
      </div>
      {needsFx && account.opening_reporting_amount === null ? <p className="mt-2 min-w-0 break-words text-xs text-[var(--ui-warning-text)]">{t("openingFx.missing")}</p> : null}
      {locked ? <div className="mt-5 min-w-0"><p className="ui-numeric [overflow-wrap:anywhere] text-xl font-semibold text-[var(--ui-text)]">{currency && entry ? formatFinanceAmount(entry.recorded_balance, currency, locale) : "—"}</p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("movements.recordedBalance")}</p></div> : null}
      {account.opening_balance !== 0 ? <details className="mt-4 min-w-0 border-t border-[var(--ui-border-subtle)] pt-3 text-xs text-[var(--ui-text-muted)]"><summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("openingDetails")}</summary><div className="min-w-0 space-y-1 break-words [overflow-wrap:anywhere] pt-1"><p>{t("openingBalance")} · <span className="ui-numeric">{currency ? formatFinanceAmount(account.opening_balance, currency, locale) : `${account.opening_balance} ${account.currency}`}</span></p>{needsFx && account.opening_reporting_amount !== null ? <p>{t("openingFx.value")} · {reportingCurrency ? formatFinanceAmount(account.opening_reporting_amount, reportingCurrency, locale) : "—"} · {account.opening_fx_rate} {settings?.base_currency} / {account.currency} · {t(account.opening_fx_source === "nbu" ? "movements.nbu" : "movements.manual")} · {account.opening_fx_effective_date}</p> : null}</div></details> : null}
    </li>;
  }

  return <div className="w-full min-w-0 space-y-6">
    <PageHeader className="items-start max-sm:flex-col" title={locked ? t("accounts") : t("title")} description={locked ? t("accountsHelp") : t("description")} action={settings ? <Button className="gap-1.5" onClick={() => setEditor("new")}><Plus className="size-4" aria-hidden="true"/>{t("addAccount")}</Button> : null}/>
    {locked && settings ? <details className={`${panel} w-fit max-w-full px-4 py-2 text-sm`}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span>{t("settings")}</span><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("finalized")}</span></summary><div className="mt-3 border-t border-[var(--ui-border)] pt-3"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-[var(--ui-text-muted)]">{t("baseCurrency")}</dt><dd className="mt-0.5 font-medium">{settings.base_currency}</dd></div><div><dt className="text-xs text-[var(--ui-text-muted)]">{t("cutoverDate")}</dt><dd className="mt-0.5 font-medium">{formatDateOnly(settings.cutover_date, locale)}</dd></div></dl><p className="mt-3 text-xs text-[var(--ui-text-muted)]">{t("finalizedHelp")}</p></div></details> : <section className={`${panel} space-y-4 p-4 sm:p-5`} aria-labelledby="finance-settings-title"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="finance-settings-title" className="font-semibold text-[var(--ui-text)]">{t("settings")}</h2><span className="text-sm text-[var(--ui-text-muted)]">{t("draft")}</span></div><div className="max-w-2xl"><SettingsForm key={settings?.updated_at ?? "new"} settings={settings} currencies={currencies} today={today}/></div></section>}

    {missingValuations.length ? <p role="status" className={`${panel} p-4 text-sm`}>{t(locked ? "openingFx.legacy" : "openingFx.required")}</p> : null}
    {locked && totals.length ? <section aria-label={t("balance.currencyTotals")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{totals.map(({ currency, amount }) => <div key={currency.code} className={`${panel} min-w-0 px-4 py-3`}><p className="text-xs font-medium text-[var(--ui-text-muted)]">{currency.code}</p><p className="ui-numeric mt-1 break-words text-lg font-semibold">{formatFinanceAmount(amount, currency, locale, "decimal")}</p></div>)}</section> : null}
    <section aria-label={t("accounts")} className="@container space-y-3">
      {!locked ? <div><h2 className="font-semibold text-[var(--ui-text)]">{t("accounts")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("accountsHelp")}</p></div> : null}
      {active.length ? <ul className="grid gap-3 @min-[42rem]:grid-cols-2 @min-[75rem]:grid-cols-3">{active.map(accountCard)}</ul> : <p className={`${panel} p-5 text-sm text-[var(--ui-text-muted)]`}>{settings ? t("emptyAccounts") : t("setupFirst")}</p>}
      {archived.length ? <details className={panel}><summary className="cursor-pointer px-5 py-4 text-sm font-medium">{t("archivedAccounts", { count: archived.length })}</summary><p className="px-5 pb-3 text-sm text-[var(--ui-text-muted)]">{t("archivedHelp")}</p><ul className="grid gap-3 p-3 @min-[42rem]:grid-cols-2 @min-[75rem]:grid-cols-3">{archived.map(accountCard)}</ul></details> : null}
    </section>

    {settings && !locked ? <section className={`${panel} space-y-3 p-4 sm:p-5`} aria-labelledby="finance-finalize-title"><h2 id="finance-finalize-title" className="font-semibold">{t("finalizeTitle")}</h2><p className="text-sm text-[var(--ui-text-secondary)]">{t("finalizeHelp")}</p><Button variant="outline" disabled={!active.length || missingValuations.length > 0} onClick={() => setFinalizing(true)}>{t("reviewFinalize")}</Button></section> : null}

    <Dialog isOpen={valuing !== null} closeDisabled={dialogPending} onRequestClose={() => setValuing(null)} title={t("openingFx.value")} closeLabel={t("close")}>
      {settings && valuationAccount ? <div className="p-5"><OpeningValuationForm key={`${valuationAccount.id}:${valuationAccount.updated_at}:${settings.base_currency}:${settings.cutover_date}`} account={valuationAccount} settings={settings} onSaved={() => setValuing(null)} onPendingChange={setDialogPending} /></div> : null}
    </Dialog>
    <Dialog isOpen={editor !== null} closeDisabled={dialogPending} onRequestClose={() => setEditor(null)} title={selectedAccount ? t("editAccount") : t("addAccount")} closeLabel={t("close")}>
      {settings && editor !== null ? <div className="p-5"><AccountForm key={editor === "new" ? editor : `${editor}:${settings.finalized_at ?? "draft"}`} account={selectedAccount} settings={settings} currencies={currencies} today={today} onSaved={() => setEditor(null)} onPendingChange={setDialogPending} /></div> : null}
    </Dialog>
    <Dialog isOpen={balancing !== null} closeDisabled={dialogPending} onRequestClose={() => setBalancing(null)} title={t(balancing?.opening ? "balance.setOpening" : "balance.adjust")} closeLabel={t("close")}>
      {settings && balanceAccount && balanceCurrency && balancing ? <div className="p-5"><AccountBalanceForm key={`${balanceAccount.id}:${balancing.opening}`} account={balanceAccount} balance={balances.find((entry) => entry.id === balanceAccount.id)?.recorded_balance ?? "0"} currency={balanceCurrency} settings={settings} today={today} opening={balancing.opening} onSaved={() => setBalancing(null)} onPendingChange={setDialogPending} /></div> : null}
    </Dialog>
    <Dialog isOpen={finalizing && !locked} closeDisabled={dialogPending} onRequestClose={() => setFinalizing(false)} title={t("finalizeTitle")} closeLabel={t("close")}>
      {finalizing ? <div className="space-y-4 p-5"><p className="text-sm text-[var(--ui-text-secondary)]">{t("finalizeHelp")}</p><FinanceForm label={t("finalize")} onSaved={() => setFinalizing(false)} onPendingChange={setDialogPending}><input type="hidden" name="intent" value="finalize" /><label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4 shrink-0 accent-[var(--ui-action-primary)]" type="checkbox" name="confirmed" required /><span>{t("confirmFinalize")}</span></label></FinanceForm></div> : null}
    </Dialog>
  </div>;
}
