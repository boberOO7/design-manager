"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceFoundation } from "@/app/(app)/finance/actions";
import { FinanceCurrencySelect } from "@/components/finance/currency-select";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateOnly } from "@/lib/utils";
import { formatFinanceAmount, type FinanceAccount, type FinanceActionState, type FinanceCurrency, type FinanceSettings } from "@/lib/finance";
import type { Database } from "@/types/database.types";

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
  const [currency, setCurrency] = useState(account?.currency ?? settings.base_currency);
  const locked = Boolean(settings.finalized_at);
  const precision = currencies.find((entry) => entry.code === currency)?.minor_units ?? 2;
  return <FinanceForm label={t("saveAccount")} onSaved={onSaved} onPendingChange={onPendingChange}>
    <input type="hidden" name="intent" value="account" />
    <input type="hidden" name="accountId" value={account?.id ?? ""} />
    <FormField label={t("accountName")}><Input name="name" defaultValue={account?.name ?? ""} required maxLength={120} autoComplete="off" data-dialog-initial-focus /></FormField>
    <FormField label={t("currency")}>{locked && account ? <><Input value={currency} readOnly aria-label={t("currency")} /><input type="hidden" name="currency" value={currency} /></> : <FinanceCurrencySelect currencies={currencies} name="currency" value={currency} reportingCurrency={settings.base_currency} onValueChange={setCurrency} />}</FormField>
    <FormField label={t("openingBalance")}>
      <Input name="openingBalance" inputMode="decimal" defaultValue={String(account?.opening_balance ?? 0)} readOnly={locked} required aria-describedby="finance-balance-help" />
    </FormField>
    <p id="finance-balance-help" className="text-sm text-[var(--ui-text-muted)]">{locked ? t("openingLockedHelp") : t("openingHelp", { digits: precision })}</p>
  </FinanceForm>;
}

export function FinanceWorkspace({ settings, accounts, currencies, balances, today }: { settings: FinanceSettings | null; accounts: FinanceAccount[]; currencies: FinanceCurrency[]; balances: Database["public"]["Views"]["finance_account_balances"]["Row"][]; today: string }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const [editor, setEditor] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [dialogPending, setDialogPending] = useState(false);
  const locked = Boolean(settings?.finalized_at);
  const selectedAccount = accounts.find((account) => account.id === editor) ?? null;
  const active = accounts.filter((account) => !account.archived_at);
  const archived = accounts.filter((account) => account.archived_at);

  function accountRow(account: FinanceAccount) {
    const currency = currencies.find((entry) => entry.code === account.currency);
    const balance = balances.find((entry) => entry.id === account.id)?.recorded_balance;
    return <li key={account.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0 flex-1 basis-40">
        <p className="break-words font-medium text-[var(--ui-text)]">{account.name}</p>
        {settings?.finalized_at ? <p className="mt-1 text-sm text-[var(--ui-text)]">{t("movements.recordedBalance")} · <span className="ui-numeric">{currency && balance !== null && balance !== undefined ? formatFinanceAmount(balance, currency, locale) : "—"}</span></p> : null}
        <p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("openingBalance")} · <span className="ui-numeric">{currency ? formatFinanceAmount(account.opening_balance, currency, locale) : `${account.opening_balance} ${account.currency}`}</span></p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {!account.archived_at ? <Button type="button" variant="ghost" aria-label={t("editNamed", { name: account.name })} onClick={() => setEditor(account.id)}>{t("edit")}</Button> : null}
        <FinanceForm key={account.archived_at ?? "active"} label={account.archived_at ? t("restore") : t("archive")} secondary>
          <input type="hidden" name="intent" value={account.archived_at ? "restore" : "archive"} />
          <input type="hidden" name="accountId" value={account.id} />
        </FinanceForm>
      </div>
    </li>;
  }

  return <div className="mx-auto w-full max-w-4xl space-y-6">
    <PageHeader title={t("title")} description={t("description")} />
    <section className={`${panel} space-y-4 p-4 sm:p-5`} aria-labelledby="finance-settings-title">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="finance-settings-title" className="font-semibold text-[var(--ui-text)]">{t("settings")}</h2><span className="text-sm text-[var(--ui-text-muted)]">{locked ? t("finalized") : t("draft")}</span></div>
      {locked && settings ? <><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-[var(--ui-text-muted)]">{t("baseCurrency")}</dt><dd className="mt-1 font-medium">{settings.base_currency}</dd></div><div><dt className="text-sm text-[var(--ui-text-muted)]">{t("cutoverDate")}</dt><dd className="mt-1 font-medium">{formatDateOnly(settings.cutover_date, locale)}</dd></div></dl><p className="text-sm text-[var(--ui-text-muted)]">{t("finalizedHelp")}</p></> : <SettingsForm key={settings?.updated_at ?? "new"} settings={settings} currencies={currencies} today={today} />}
    </section>

    <section className={panel} aria-labelledby="finance-accounts-title">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--ui-border)] p-4 sm:p-5"><div className="min-w-0 flex-1 basis-52"><h2 id="finance-accounts-title" className="font-semibold text-[var(--ui-text)]">{t("accounts")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("accountsHelp")}</p></div>{settings ? <Button onClick={() => setEditor("new")}>{t("addAccount")}</Button> : null}</div>
      {active.length ? <ul className="divide-y divide-[var(--ui-border)]">{active.map(accountRow)}</ul> : <p className="p-5 text-sm text-[var(--ui-text-muted)]">{settings ? t("emptyAccounts") : t("setupFirst")}</p>}
      {archived.length ? <details className="border-t border-[var(--ui-border)]"><summary className="cursor-pointer px-5 py-4 text-sm font-medium">{t("archivedAccounts", { count: archived.length })}</summary><p className="px-5 pb-3 text-sm text-[var(--ui-text-muted)]">{t("archivedHelp")}</p><ul className="divide-y divide-[var(--ui-border)]">{archived.map(accountRow)}</ul></details> : null}
    </section>

    {settings && !locked ? <section className={`${panel} space-y-3 p-4 sm:p-5`} aria-labelledby="finance-finalize-title"><h2 id="finance-finalize-title" className="font-semibold">{t("finalizeTitle")}</h2><p className="text-sm text-[var(--ui-text-secondary)]">{t("finalizeHelp")}</p><Button variant="outline" disabled={!active.length} onClick={() => setFinalizing(true)}>{t("reviewFinalize")}</Button></section> : null}

    <Dialog isOpen={editor !== null} closeDisabled={dialogPending} onRequestClose={() => setEditor(null)} title={selectedAccount ? t("editAccount") : t("addAccount")} closeLabel={t("close")}>
      {settings && editor !== null ? <div className="p-5"><AccountForm key={`${editor}:${settings.finalized_at ?? "draft"}`} account={selectedAccount} settings={settings} currencies={currencies} onSaved={() => setEditor(null)} onPendingChange={setDialogPending} /></div> : null}
    </Dialog>
    <Dialog isOpen={finalizing && !locked} closeDisabled={dialogPending} onRequestClose={() => setFinalizing(false)} title={t("finalizeTitle")} closeLabel={t("close")}>
      {finalizing ? <div className="space-y-4 p-5"><p className="text-sm text-[var(--ui-text-secondary)]">{t("finalizeHelp")}</p><FinanceForm label={t("finalize")} onSaved={() => setFinalizing(false)} onPendingChange={setDialogPending}><input type="hidden" name="intent" value="finalize" /><label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4 shrink-0 accent-[var(--ui-action-primary)]" type="checkbox" name="confirmed" required /><span>{t("confirmFinalize")}</span></label></FinanceForm></div> : null}
    </Dialog>
  </div>;
}
