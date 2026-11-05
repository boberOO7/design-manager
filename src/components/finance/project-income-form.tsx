"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceProjectData, getFinanceData } from "@/data/queries/finance";
import { saveProjectIncome } from "@/app/(app)/finance/project-income-actions";
import { AnimatedFormContent } from "@/components/ui/animated-form-content";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { FormField, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";
import { ExpectedForm } from "./expected-workspace";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
type IncomeStream = "supervision" | "contractor_bonus" | "other";
type Props = {
  data: Foundation; project: FinanceProjectData; initialStream: string; today: string; pending: boolean;
  onPending: (pending: boolean) => void; onSaved: (stream: IncomeStream, id?: string) => void;
};

export function ProjectIncomeForm({ data, project, initialStream, today, pending, onPending, onSaved }: Props) {
  const t = useTranslations("Finance");
  const [stream, setStream] = useState<IncomeStream | "">(
    initialStream === "supervision" || initialStream === "contractor_bonus" || initialStream === "other" ? initialStream : "",
  );
  return <div className="space-y-4">
    <FormField as="div" label={t("projectIncome.type")}><Select aria-label={t("projectIncome.type")} value={stream} disabled={pending} onValueChange={value => {
      if (value === "supervision" || value === "contractor_bonus" || value === "other") setStream(value);
    }}><SelectItem value="">{t("projectIncome.chooseType")}</SelectItem>{(["contractor_bonus", "other", "supervision"] as const).map(value => <SelectItem key={value} value={value}>{t(`project.streams.${value}`)}</SelectItem>)}</Select></FormField>
    <div className={`grid transition-[grid-template-rows] duration-[220ms] ease-out motion-reduce:transition-none ${stream ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}><div className="min-h-0 overflow-clip">{stream === "supervision" ? <>
      <p className="text-xs leading-5 text-[var(--ui-text-secondary)]">{t("projectIncome.supervisionHelp")}</p>
      <ExpectedForm data={data} project={{ ...project, stream, today }} hideCategory onPending={onPending} onSaved={() => onSaved(stream)}/>
    </> : stream ? <QuickIncomeForm key={stream} data={data} project={project} stream={stream} today={today} onPending={onPending} onSaved={id => onSaved(stream, id)}/> : null}</div></div>
  </div>;
}

function QuickIncomeForm({ data, project, stream, today, onPending, onSaved }: {
  data: Foundation; project: FinanceProjectData; stream: "contractor_bonus" | "other"; today: string;
  onPending: (pending: boolean) => void; onSaved: (id?: string) => void;
}) {
  const t = useTranslations("Finance"), locale = useLocale();
  const [mode, setMode] = useState<"expected" | "received">("expected");
  const [currency, setCurrency] = useState(data.settings?.base_currency ?? "UAH");
  const [amount, setAmount] = useState("");
  const activeAccounts = data.accounts.filter(account => !account.archived_at);
  const [accountId, setAccountId] = useState(activeAccounts.find(account => account.currency === currency)?.id ?? "");
  const [date, setDate] = useState(today), [expected, setExpected] = useState("");
  const [contractor, setContractor] = useState("");
  const defaultCategory = data.categories.find(category => !category.archived_at && category.default_key === (stream === "contractor_bonus" ? "contractor_bonus" : "other_income"));
  const matchingAccounts = activeAccounts.filter(account => account.currency === currency);
  return <FinanceActionForm action={saveProjectIncome} onSaved={result => onSaved(result.id)} onPending={onPending}
    label={t(mode === "received" ? "projectIncome.saveReceived" : "projectIncome.saveExpected")}
    disabled={!defaultCategory || (mode === "received" && (!accountId || !matchingAccounts.some(account => account.id === accountId)))} submitClassName="min-h-11">
    <input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="stream" value={stream}/>
    <input type="hidden" name="direction" value="incoming"/>
    <input type="hidden" name="categoryId" value={defaultCategory?.id ?? ""}/>
    {!defaultCategory ? <p role="alert" className="text-xs text-[var(--ui-danger-text)]">{t("planning.noCategories")}</p> : null}
    <input type="hidden" name="commitment" value="agreed"/>
    <input type="hidden" name="certainty" value="fixed"/>
    <input type="hidden" name="established" value={String(mode === "received")}/>
    <fieldset><legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("projectIncome.state")}</legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["expected", "received"] as const).map(value => <label key={value} className="relative cursor-pointer"><input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="peer absolute inset-0 size-full cursor-pointer opacity-0"/><span className="flex min-h-11 items-center rounded-[calc(var(--ui-radius-control)-2px)] px-4 text-sm text-[var(--ui-text-secondary)] transition-colors duration-200 peer-checked:bg-[var(--ui-surface)] peer-checked:font-semibold peer-checked:text-[var(--ui-text)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none">{t(`projectIncome.${value}`)}</span></label>)}</div>
    </fieldset>
    <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
      <FormField label={t("movements.amount")}><DecimalInput name="amount" value={amount} onChange={event => setAmount(event.target.value)} className="ui-numeric text-lg font-semibold" required/></FormField>
      <FormField as="div" label={t("planning.currency")}><FinanceCurrencySelect name="currency" aria-label={t("planning.currency")} currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={currency} onValueChange={value => { setCurrency(value); setAccountId(activeAccounts.find(account => account.currency === value)?.id ?? ""); }}/></FormField>
    </div>
    {stream === "contractor_bonus" ? <FormField as="div" label={t("project.contractor")}><Select name="contractorId" aria-label={t("project.contractor")} value={contractor} onValueChange={setContractor} searchPlaceholder={t("project.searchContractors")}><SelectItem value="">{t("project.noContractor")}</SelectItem>{project.contractors.map(contractor => <SelectItem key={contractor.id} value={contractor.id}>{contractor.name}</SelectItem>)}</Select></FormField> : null}
    <FormField label={t("movements.description")}><Textarea name="description" rows={2} maxLength={2000}/></FormField>
    <div><AnimatedFormContent isOpen={mode === "received"}><fieldset disabled={mode !== "received"} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <FormField as="div" label={t("movements.account")}><Select name="accountId" aria-label={t("movements.account")} value={accountId} onValueChange={setAccountId} required><SelectItem value="">{t("projectIncome.chooseAccount")}</SelectItem>{matchingAccounts.map(account => <SelectItem key={account.id} value={account.id}>{account.name} · {account.currency}</SelectItem>)}</Select></FormField>
        <FormField as="div" label={t("movements.date")}><DatePicker name="date" aria-label={t("movements.date")} value={date} onValueChange={setDate} min="1900-01-01" max={today} locale={locale} required/></FormField>
      </div>
      <input type="hidden" name="dueDate" value={date}/><input type="hidden" name="expectedDate" value={date}/>
      {!matchingAccounts.length ? <p role="status" className="text-xs text-[var(--ui-warning-text)]">{t("projectIncome.noAccount", { currency })}</p> : null}
      <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("projectIncome.existingReceiptHelp")}</p>
    </fieldset></AnimatedFormContent>
    <AnimatedFormContent isOpen={mode === "expected"}><fieldset disabled={mode !== "expected"} className="space-y-3">
      <input type="hidden" name="dueDate" value=""/>
      <FormField as="div" className="max-w-44" label={t("planning.expectedDate")}><DatePicker name="expectedDate" aria-label={t("planning.expectedDate")} value={expected} onValueChange={setExpected} locale={locale}/></FormField>
    </fieldset></AnimatedFormContent></div>
  </FinanceActionForm>;
}
