"use client";

import { DragDropProvider, PointerSensor, type DragEndEvent } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import * as Popover from "@radix-ui/react-popover";
import { ArrowDown, ArrowUp, Ellipsis, GripVertical, LockKeyhole, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getProjectReferenceRate, saveFinanceProject } from "@/app/(app)/finance/project-actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { projectAreaValue, projectDiscountAmounts, projectRescalePayments, projectClientPaymentSchedule, projectGrossToBasis, projectScheduleVatAmounts, projectMoneyText, projectMoneyUnits, projectPaymentTemplates, projectPaymentDefaultKey, projectReferenceValue, projectRevenueTaxAmounts, projectVatAmounts, type ProjectPlanInput, type ProjectDiscountType } from "@/lib/finance-project-plan";
import { cn } from "@/lib/utils";
import type { FinanceProjectData } from "@/data/queries/finance";

type Row = ProjectPlanInput["items"][number] & { key: string; percentage: string; differentDate: boolean; defaultName: string };
type RowCopy = {
  actions: string; amount: string; differentDate: string; drag: string; dueDate: string; expectedDate: string;
  moveDown: string; moveUp: string; name: string; percentage: string; remove: string; note: string;
};

const paymentSensors = [PointerSensor.configure({})];
const compactControl = "h-11 lg:h-9";

function RateChips({ label, choices, value, onChange }: {
  label: string; choices: { value: string; label: string }[]; value: string; onChange: (value: string) => void;
}) {
  return <div className="space-y-1.5"><p className="text-sm font-medium text-[var(--ui-text-secondary)]">{label}</p><div role="group" aria-label={label} className="flex flex-wrap gap-2">
    {choices.map((choice) => <Button key={choice.value} type="button" size="sm" variant="outline" aria-pressed={value === choice.value} className={cn("min-h-11 rounded-full px-3 sm:min-h-9", value === choice.value && "border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-surface)] hover:bg-[var(--ui-text)] hover:text-[var(--ui-surface)]")} onClick={() => onChange(choice.value)}>{choice.label}</Button>)}
  </div></div>;
}

export function FinanceVatControls({ amount, vatRate, priceBasis, digits, money, onRateChange, onBasisChange, labels, hidePreview = false }: {
  hidePreview?: boolean; amount: string; vatRate: string | null; priceBasis: "net" | "gross" | null; digits: number;
  money: (amount: string) => string; onRateChange: (rate: string | null) => void; onBasisChange: (basis: "net" | "gross") => void;
  labels: { vat: string; rate: string; custom: string; none: string; basis: string; net: string; gross: string; customRate: string; }
}) {
  const [customRate, setCustomRate] = useState(vatRate !== null && !["8", "20", "23"].includes(vatRate) ? vatRate : "");
  const selection = vatRate === null ? "none" : ["8", "20", "23"].includes(vatRate) ? vatRate : "custom";
  let preview = "";
  try {
    const amounts = projectVatAmounts(amount, vatRate, priceBasis, digits);
    preview = `${labels.net} ${money(amounts.net)} · ${labels.vat} ${money(amounts.vat)} · ${labels.gross} ${money(amounts.gross)}`;
  } catch { /* Keep controls visible while the user enters an amount or rate. */ }
  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <RateChips label={labels.rate} value={selection} choices={[{ value: "none", label: labels.none }, { value: "8", label: "8%" }, { value: "20", label: "20%" }, { value: "23", label: "23%" }, { value: "custom", label: labels.custom }]} onChange={(value) => {
        onRateChange(value === "none" ? null : value === "custom" ? customRate : value);
      }}/>
      {selection === "custom" ? <FormField label={labels.customRate} className="w-40"><Input aria-label={labels.customRate} inputMode="decimal" value={vatRate ?? customRate} onChange={(event) => { setCustomRate(event.target.value); onRateChange(event.target.value); }} required className={compactControl}/></FormField> : null}
    </div>
    {selection !== "none" ? <button type="button" role="switch" aria-label={labels.basis} aria-checked={priceBasis === "gross"} onClick={() => onBasisChange(priceBasis === "gross" ? "net" : "gross")} className="inline-flex min-h-11 items-center gap-2 rounded-full text-left text-sm font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
      <span aria-hidden="true" className={cn("relative h-6 w-[3.25rem] shrink-0 rounded-full shadow-inner transition-colors duration-200 motion-reduce:transition-none", priceBasis === "gross" ? "bg-[var(--ui-action-primary)]" : "bg-[var(--ui-surface-strong)]")}><span className={cn("absolute left-1 top-1 size-4 rounded-full shadow-[var(--ui-shadow-panel)] transition-[transform,translate,background-color] duration-200 ease-out motion-reduce:transition-none", priceBasis === "gross" ? "translate-x-7 bg-[var(--ui-action-primary-text)]" : "bg-[var(--ui-action-primary)]")}/></span><span>{labels.basis}</span>
    </button> : null}
    {preview && !hidePreview ? <p aria-live="polite" className="text-xs font-medium text-[var(--ui-text-secondary)]">{preview}</p> : null}
  </div>;
}

function RevenueTaxControls({ net, rate, digits, money, onRateChange, labels }: {
  net: string; rate: string | null; digits: number; money: (amount: string) => string; onRateChange: (rate: string | null) => void;
  labels: { title: string; none: string; custom: string; customRate: string; afterTax: string; }
}) {
  const [customRate, setCustomRate] = useState(rate !== null && rate !== "6" ? rate : "");
  const selection = rate === null ? "none" : rate === "6" ? "6" : "custom";
  let preview = "";
  if (rate !== null) {
    try {
      const amounts = projectRevenueTaxAmounts(net, rate, digits);
      preview = `${labels.title} ${rate}%: ${money(amounts.tax)} · ${labels.afterTax}: ${money(amounts.afterTax)}`;
    } catch { /* An incomplete custom rate has no estimate. */ }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3"><RateChips label={labels.title} value={selection} choices={[{ value: "none", label: labels.none }, { value: "6", label: "6%" }, { value: "custom", label: labels.custom }]} onChange={(value) => {
      onRateChange(value === "none" ? null : value === "custom" ? customRate : value);
    }}/>{selection === "custom" ? <FormField label={labels.customRate} className="w-40"><Input aria-label={labels.customRate} inputMode="decimal" value={rate ?? customRate} onChange={(event) => { setCustomRate(event.target.value); onRateChange(event.target.value); }} required className={compactControl}/></FormField> : null}</div>
    {preview ? <p aria-live="polite" className="text-xs font-medium text-[var(--ui-text-secondary)]">{preview}</p> : null}
  </div>;
}

function decimalText(units: bigint, digits: number) {
  return projectMoneyText(units, digits).replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1");
}
function basisAmount(item: FinanceProjectData["planItems"][number], basis: "net" | "gross" | null, vatRate: string | null, digits: number) {
  if (basis === "net" && item.price_basis === "net" && vatRate !== null && item.vat_rate !== null && Number(item.vat_rate) === Number(vatRate)) return item.net_amount;
  return projectGrossToBasis(item.amount, vatRate, basis, digits);
}

function PaymentRow({ amount, copy, index, locale, money, onMove, onRemove, onUpdate, row, rowCount, strategy }: {
  amount: string; copy: RowCopy; index: number; locale: string; money: (amount: string) => string;
  onMove: (index: number, offset: number) => void; onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<Row>) => void; row: Row; rowCount: number; strategy: string;
}) {
  const { handleRef, isDragging, ref } = useSortable({ id: row.key, index, group: "project-payments", type: "project-payment", accept: "project-payment", plugins: [] });
  const [actionsOpen, setActionsOpen] = useState(false);
  const field = "grid self-start gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]";
  const act = (run: () => void) => { setActionsOpen(false); run(); };
  return <li ref={ref} className={cn("py-2.5 transition-opacity", isDragging && "opacity-35")} data-plan-row>
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-end gap-x-2 gap-y-3 lg:grid-cols-[2.75rem_minmax(10rem,2fr)_6rem_9rem_10.5rem_2.75rem]">
      <button ref={handleRef} type="button" aria-label={copy.drag} title={copy.drag} className="flex size-11 cursor-grab items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] active:cursor-grabbing lg:size-9"><GripVertical className="size-4" aria-hidden="true"/></button>
      <label className={field}><span className="lg:sr-only">{copy.name}</span><Input aria-label={copy.name} value={row.name} onChange={(event) => onUpdate(index, { name: event.target.value })} required maxLength={2000} className={compactControl}/></label>
      <div className="col-span-3 grid grid-cols-2 items-end gap-3 lg:contents">
        {strategy === "redistribute" ? <label className={field}><span className="lg:sr-only">{copy.percentage}</span><Input aria-label={copy.percentage} inputMode="decimal" value={row.percentage} onChange={(event) => onUpdate(index, { percentage: event.target.value })} required className={compactControl}/></label> : null}
        <div className={field}><span className="lg:sr-only">{copy.amount}</span>{strategy === "redistribute" ? <output aria-label={copy.amount} data-derived-amount={amount} className="ui-numeric flex h-11 items-center px-1 font-semibold text-[var(--ui-text)] lg:h-9">{amount ? money(amount) : "—"}</output> : <Input aria-label={copy.amount} inputMode="decimal" value={row.amount} readOnly={strategy === "keep" && Boolean(row.id)} onChange={(event) => onUpdate(index, { amount: event.target.value })} required className={cn(compactControl, "ui-numeric")}/>}</div>
        <label className={cn(field, "col-span-2 lg:col-span-1")}><span className="lg:sr-only">{copy.dueDate}</span><DatePicker aria-label={copy.dueDate} className={compactControl} value={row.dueDate} onValueChange={(dueDate) => onUpdate(index, { dueDate })} locale={locale}/></label>
      </div>
      <Popover.Root open={actionsOpen} onOpenChange={setActionsOpen}><Popover.Trigger asChild><button type="button" aria-label={copy.actions} aria-haspopup="menu" className="flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] lg:size-9"><Ellipsis className="size-4" aria-hidden="true"/></button></Popover.Trigger><Popover.Portal><Popover.Content role="menu" align="end" sideOffset={4} collisionPadding={8} className="z-[80] min-w-48 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]">
        <button type="button" role="menuitem" disabled={index === 0} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-40" onClick={() => act(() => onMove(index, -1))}><ArrowUp className="size-4" aria-hidden="true"/>{copy.moveUp}</button>
        <button type="button" role="menuitem" disabled={index === rowCount - 1} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-40" onClick={() => act(() => onMove(index, 1))}><ArrowDown className="size-4" aria-hidden="true"/>{copy.moveDown}</button>
        <button type="button" role="menuitem" className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => act(() => onRemove(index))}><Trash2 className="size-4" aria-hidden="true"/>{copy.remove}</button>
      </Popover.Content></Popover.Portal></Popover.Root>
    </div>
    <label className="mt-2 block lg:ml-[3.25rem]"><span className="sr-only">{copy.note}</span><Input aria-label={copy.note} placeholder={copy.note} value={row.clientNote} maxLength={300} onChange={(event) => onUpdate(index, { clientNote: event.target.value })} className="h-9 text-xs"/></label>
    <AnimatedDisclosure title={copy.differentDate} className="mt-0.5 max-w-sm" open={row.differentDate} onOpenChange={(differentDate) => onUpdate(index, { differentDate })}><div className="pb-1 pt-2"><FormField label={copy.expectedDate}><DatePicker aria-label={copy.expectedDate} className={compactControl} value={row.expectedDate} onValueChange={(expectedDate) => onUpdate(index, { expectedDate })} locale={locale}/></FormField></div></AnimatedDisclosure>
  </li>;
}

export function ProjectValueBuilder({ project, currencies, reportingCurrency, onSaved, onPending }: {
  project: FinanceProjectData; currencies: FinanceCurrency[]; reportingCurrency: string;
  onSaved: () => void; onPending: (pending: boolean) => void;
}) {
  const t = useTranslations("Finance"), locale = useLocale();
  const current = project.terms.find((item) => item.stream === "design");
  const pricing = project.planRevisions.find((item) => item.terms_id === current?.id);
  const protectedItems = project.planItems.filter((item) => item.has_settlement_history);
  const [method, setMethod] = useState<"fixed" | "area">(pricing?.pricing_method === "area" ? "area" : current ? "fixed" : "area");
  const [currency, setCurrency] = useState(current?.currency ?? reportingCurrency);
  const selected = currencies.find((item) => item.code === currency), digits = selected?.minor_units ?? 2;
  const discountScheduleBase = useRef<{ context: string; pool: string; amounts: string[] } | null>(null);
  const [discountType, setDiscountType] = useState<ProjectDiscountType>(current?.discount_type === "percentage" || current?.discount_type === "fixed" ? current.discount_type : "none");
  const [discountValue, setDiscountValue] = useState(String(current?.discount_value ?? "0"));
  const [value, setValue] = useState(String(current?.amount ?? ""));
  const [vatRate, setVatRate] = useState<string | null>(current?.vat_rate == null ? null : String(current.vat_rate));
  const [priceBasis, setPriceBasis] = useState<"net" | "gross" | null>(current?.price_basis === "net" || current?.price_basis === "gross" ? current.price_basis : null);
  const [revenueTaxRate, setRevenueTaxRate] = useState<string | null>(current?.revenue_tax_rate == null ? null : String(current.revenue_tax_rate));
  const [area, setArea] = useState(String(pricing?.area_snapshot ?? project.area ?? ""));
  const [rate, setRate] = useState(String(pricing?.rate_per_m2 ?? ""));
  const [strategy, setStrategy] = useState(current ? "manual" : "redistribute");
  const [allowUnscheduled, setAllowUnscheduled] = useState(Number(project.totals.find((item) => item.stream === "design")?.unscheduled_amount ?? 0) > 0);
  const [reserve, setReserve] = useState("0");
  const [addGuidance, setAddGuidance] = useState(false);

  function defaultName(name: string, index: number) {
    return ["projectPayment", "advance", "finalPayment", "planningStage", "visualizationStage", "documentationStage", "paymentNumber"].some((key) => name === t(`builder.${key}`, { number: protectedItems.length + index + 1 })) ? name : "";
  }
  function freshRow(index: number, count: number, percentage = "", percentages?: readonly number[]): Row {
    const key = percentages ? projectPaymentDefaultKey(percentages, index) : count === 2 ? index === 0 ? "advance" : "finalPayment" : "paymentNumber";
    const name = t(`builder.${key}`, { number: protectedItems.length + index + 1 });
    return { key: crypto.randomUUID(), id: "", name, defaultName: name, clientNote: "", amount: "", percentage, dueDate: "", expectedDate: "", differentDate: false };
  }

  const [rows, setRows] = useState<Row[]>(() => current ? project.planItems.filter((item) => !item.has_settlement_history).sort((left, right) => {
    const order = pricing?.item_order ?? [];
    const leftIndex = order.indexOf(left.id ?? ""), rightIndex = order.indexOf(right.id ?? "");
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex) || (left.due_date ?? "9999").localeCompare(right.due_date ?? "9999");
  }).map((item, index) => ({ key: item.id ?? crypto.randomUUID(), id: item.id ?? "", name: item.description ?? "", defaultName: defaultName(item.description ?? "", index), clientNote: item.client_note ?? "", amount: item.amount, percentage: item.schedule_percentage == null ? "" : String(item.schedule_percentage), dueDate: item.due_date ?? "", expectedDate: item.expected_payment_date ?? "", differentDate: Boolean(item.expected_payment_date && item.expected_payment_date !== item.due_date) })) : [freshRow(0, 2, "50"), freshRow(1, 2, "50")]);
  const [protectedNotes, setProtectedNotes] = useState(() => protectedItems.map((item) => ({ id: item.id, clientNote: item.client_note ?? "" })));
  const [referenceState, setReferenceState] = useState<{ currency: string; failed: boolean; value: { rate: string; effectiveDate: string } | null }>({ currency: "", failed: false, value: null });
  const [referenceAttempt, setReferenceAttempt] = useState(0);

  useEffect(() => {
    if (reportingCurrency !== "UAH" || currency === "UAH") return;
    let active = true;
    void getProjectReferenceRate(currency).then((result) => { if (active) setReferenceState({ currency, failed: !result, value: result }); }).catch(() => { if (active) setReferenceState({ currency, failed: true, value: null }); });
    return () => { active = false; };
  }, [currency, referenceAttempt, reportingCurrency]);

  const reporting = currencies.find((item) => item.code === "UAH");
  const money = (amount: string) => selected ? formatFinanceAmount(amount, selected, locale) : amount;
  const vatValid = vatRate === null || (/^\d{1,10}(?:[.,]\d{1,4})?$/.test(vatRate) && Number(vatRate.replace(",", ".")) >= 0 && priceBasis !== null);
  const revenueTaxValid = revenueTaxRate === null || /^\d{1,10}(?:[.,]\d{1,4})?$/.test(revenueTaxRate);
  let discountAmount = "", discountPercentage = "", agreedAmount = "", totalVat = "", total = "", totalNet = "", totalGross = "", protectedValue = "0", collected = "0", scheduled = "0", remainder = "0", overAmount = "0", allocationPercent = "", amounts: string[] = [], basisAmounts: string[] = [], referenceAmount = "", valid = false, error = "", hasRemainder = false;
  let poolUnits = BigInt(0), grossPoolUnits = BigInt(0), scheduledGrossUnits = BigInt(0);
  try {
    total = method === "area" ? projectAreaValue(area, rate, digits) : projectMoneyText(projectMoneyUnits(value, digits), digits);
    const discounted = projectDiscountAmounts(total, discountType, discountValue, digits);
    discountAmount = discounted.discount; discountPercentage = decimalText(projectMoneyUnits(discounted.percentage, 4), 4); agreedAmount = discounted.agreed;
    const grossParts = projectVatAmounts(agreedAmount, vatRate, priceBasis, digits);
    totalVat = grossParts.vat;
    totalNet = grossParts.net;
    totalGross = grossParts.gross;
    const contractGrossUnits = projectMoneyUnits(totalGross, digits);
    const protectedUnits = protectedItems.reduce((sum, item) => sum + projectMoneyUnits(item.amount, digits), BigInt(0));
    grossPoolUnits = contractGrossUnits - protectedUnits;
    if (grossPoolUnits < BigInt(0)) {
      overAmount = projectMoneyText(-grossPoolUnits, digits);
      remainder = projectMoneyText(BigInt(0), digits);
      throw new Error("remainder");
    }
    const grossPool = projectMoneyText(grossPoolUnits, digits);
    poolUnits = projectMoneyUnits(projectGrossToBasis(grossPool, vatRate, priceBasis, digits), digits);
    protectedValue = projectMoneyText(protectedUnits, digits);
    collected = projectMoneyText(project.planItems.reduce((sum, item) => sum + projectMoneyUnits(item.settled_amount, digits), BigInt(0)), digits);
    let percentagesBalanced = true;
    const reserved = strategy === "redistribute" && allowUnscheduled ? projectMoneyUnits(reserve, digits) : BigInt(0);
    if (poolUnits >= BigInt(0)) {
      if (strategy === "redistribute" && rows.length) {
        if (reserved > grossPoolUnits) throw new Error("remainder");
        const percentageUnits = rows.reduce((sum, row) => sum + projectMoneyUnits(row.percentage.trim() || "0", 4), BigInt(0));
        percentagesBalanced = percentageUnits === BigInt(1000000);
        ({ grossAmounts: amounts, basisAmounts } = projectClientPaymentSchedule(grossPool, rows.map((row) => row.percentage.trim() || "0"), vatRate, priceBasis, digits, projectMoneyText(reserved, digits)));
      } else {
        const grossAmounts = rows.map((row) => projectMoneyText(projectMoneyUnits(row.amount, digits), digits));
        basisAmounts = grossAmounts.map((amount, index) => {
          const previous = project.planItems.find((item) => item.id === rows[index]?.id);
          return previous && projectMoneyUnits(previous.amount, digits) === projectMoneyUnits(amount, digits) ? basisAmount(previous, priceBasis, vatRate, digits) : projectGrossToBasis(amount, vatRate, priceBasis, digits);
        });
        const scheduledBasisUnits = basisAmounts.reduce((sum, amount) => sum + projectMoneyUnits(amount, digits), BigInt(0));
        const schedule = basisAmounts.length ? projectScheduleVatAmounts(basisAmounts, vatRate, priceBasis, digits,
          vatRate !== null && priceBasis === "net" && scheduledBasisUnits === poolUnits ? grossPool : undefined) : [];
        amounts = schedule.map((item) => item.gross);
      }
      scheduledGrossUnits = amounts.reduce((sum, amount) => sum + projectMoneyUnits(amount, digits), BigInt(0));
      scheduled = projectMoneyText(scheduledGrossUnits, digits);
      const difference = contractGrossUnits - protectedUnits - scheduledGrossUnits;
      hasRemainder = difference > BigInt(0);
      remainder = projectMoneyText(difference > BigInt(0) ? difference : BigInt(0), digits);
      overAmount = projectMoneyText(difference < BigInt(0) ? -difference : BigInt(0), digits);
      valid = vatValid && revenueTaxValid && contractGrossUnits > BigInt(0) && amounts.every((amount) => projectMoneyUnits(amount, digits) > BigInt(0)) && scheduledGrossUnits <= grossPoolUnits && (scheduledGrossUnits === grossPoolUnits || allowUnscheduled) && (strategy !== "redistribute" || !rows.length || percentagesBalanced);
    } else {
      overAmount = projectMoneyText(-poolUnits, digits);
      remainder = projectMoneyText(BigInt(0), digits);
    }
    if (contractGrossUnits > BigInt(0)) allocationPercent = decimalText(((protectedUnits + scheduledGrossUnits) * BigInt(1000000) + contractGrossUnits / BigInt(2)) / contractGrossUnits, 4);
    if (!valid && overAmount === projectMoneyText(BigInt(0), digits) && !hasRemainder && !addGuidance) error = t("builder.invalidPreview");
    const reference = referenceState.currency === currency ? referenceState.value : null;
    if (reference && currency !== "UAH") referenceAmount = projectReferenceValue(total, reference.rate, digits);
  } catch { error = t("builder.invalidPreview"); }

  const payload = { projectId: project.projectId, revision: current?.revision ?? 0, pricingMethod: method, amount: total, discountType, discountValue, vatRate, priceBasis, revenueTaxRate, currency, area, rate, allowUnscheduled, protectedNotes, known: project.planItems.map((item) => ({ id: item.id, version: item.version, protected: item.has_settlement_history })), items: rows.map((row, index) => ({ id: row.id, name: row.name, clientNote: row.clientNote, percentage: strategy === "redistribute" ? row.percentage : "", amount: basisAmounts[index] ?? "", dueDate: row.dueDate, expectedDate: row.differentDate ? row.expectedDate : row.dueDate })) };

  function changeDiscount(type: ProjectDiscountType, value: string) {
    const nextValue = type === "none" ? "0" : value;
    if (strategy !== "redistribute" && rows.length) {
      const context = JSON.stringify([total, vatRate, priceBasis, currency]);
      if (discountScheduleBase.current?.context !== context) discountScheduleBase.current = null;
      if (!discountScheduleBase.current && amounts.length === rows.length && grossPoolUnits > BigInt(0)) {
        discountScheduleBase.current = { context, pool: projectMoneyText(grossPoolUnits, digits), amounts };
      }
      try {
        const base = discountScheduleBase.current;
        const discounted = projectDiscountAmounts(total, type, nextValue, digits);
        const nextGross = projectMoneyUnits(projectVatAmounts(discounted.agreed, vatRate, priceBasis, digits).gross, digits);
        const protectedGross = protectedItems.reduce((sum, item) => sum + projectMoneyUnits(item.amount, digits), BigInt(0));
        if (base && nextGross >= protectedGross) {
          const nextPool = projectMoneyText(nextGross - protectedGross, digits);
          const storedShares = rows.map(row => row.percentage || "0");
          const balanced = storedShares.reduce((sum, share) => sum + projectMoneyUnits(share, 4), BigInt(0)) === BigInt(1000000);
          const reserved = projectMoneyText(projectMoneyUnits(base.pool, digits) - base.amounts.reduce((sum, amount) => sum + projectMoneyUnits(amount, digits), BigInt(0)), digits);
          const existing = balanced ? projectClientPaymentSchedule(base.pool, storedShares, vatRate, priceBasis, digits, reserved).grossAmounts : [];
          if (existing.length === base.amounts.length && existing.every((amount, index) => amount === base.amounts[index]) && nextPool !== base.pool) {
            setReserve(reserved); setStrategy("redistribute"); discountScheduleBase.current = null;
          } else {
            const scaled = projectRescalePayments(base.amounts, base.pool, nextPool, digits);
            setRows(old => old.map((row,index) => ({ ...row, amount: scaled[index] }))); setStrategy("manual");
          }
        }
      } catch { /* Partial discount inputs keep the last valid custom schedule. */ }
    }
    setDiscountType(type); setDiscountValue(nextValue); setAddGuidance(false);
  }
  function update(index: number, patch: Partial<Row>) { discountScheduleBase.current = null; setAddGuidance(false); setRows((currentRows) => currentRows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)); }
  function applyTemplate(percentages: readonly number[]) { discountScheduleBase.current = null; setAddGuidance(false); setStrategy("redistribute"); setReserve("0"); setRows((old) => percentages.map((percentage, index) => (() => { const fresh = freshRow(index, percentages.length, String(percentage), percentages); const previous = old[index]; return { ...fresh, ...(previous ? { ...previous, name: previous.name !== previous.defaultName ? previous.name : fresh.name, defaultName: fresh.defaultName } : {}), percentage: String(percentage) }; })())); }
  function selectStrategy(next: string) { discountScheduleBase.current = null; setAddGuidance(false); if (strategy === "redistribute" && next === "manual") setRows((old) => old.map((row, index) => ({ ...row, amount: amounts[index] ?? row.amount }))); setStrategy(next); if (next === "keep") setRows((old) => old.map((row) => ({ ...row, amount: (() => { const item = project.planItems.find((entry) => entry.id === row.id); return item ? item.amount : row.amount; })() }))); }
  function move(index: number, offset: number) { discountScheduleBase.current = null; setRows((old) => { const destination = index + offset; if (destination < 0 || destination >= old.length) return old; const copy = [...old]; [copy[index], copy[destination]] = [copy[destination], copy[index]]; return copy; }); }
  function handleDragEnd(event: DragEndEvent) {
    discountScheduleBase.current = null;
    const source = String(event.operation.source?.id ?? ""), target = String(event.operation.target?.id ?? "");
    if (!source || !target || source === target) return;
    setRows((old) => { const from = old.findIndex((row) => row.key === source), to = old.findIndex((row) => row.key === target); if (from < 0 || to < 0) return old; const copy = [...old], [moved] = copy.splice(from, 1); copy.splice(to, 0, moved); return copy; });
  }
  function addPayment() {
    discountScheduleBase.current = null;
    let percentage = "", fullyAllocated = grossPoolUnits > BigInt(0) && scheduledGrossUnits >= grossPoolUnits;
    if (strategy === "redistribute") {
      try { const used = rows.reduce((sum, row) => sum + projectMoneyUnits(row.percentage.trim() || "0", 4), BigInt(0)); const available = BigInt(1000000) - used; const basis = grossPoolUnits - (allowUnscheduled ? projectMoneyUnits(reserve, digits) : BigInt(0)); if (available > BigInt(0) && basis * available / BigInt(1000000) > BigInt(0)) percentage = decimalText(available, 4); fullyAllocated = available === BigInt(0); } catch { fullyAllocated = false; }
    }
    setAddGuidance(fullyAllocated); setRows((old) => [...old, { ...freshRow(old.length, old.length + 1, percentage), name: t("builder.paymentNumber", { number: protectedItems.length + old.length + 1 }) }]);
  }

  const differentArea = pricing?.pricing_method === "area" && project.area !== null && Number(pricing.area_snapshot) !== Number(project.area);
  const showAreaMismatch = differentArea && Number(area) === Number(pricing?.area_snapshot);
  const percentageKey = rows.map((row) => row.percentage).join("/");
  const selectedTemplate = strategy === "redistribute" && projectPaymentTemplates.some((template) => template.join("/") === percentageKey) ? percentageKey : "custom";
  const referenceApplicable = reportingCurrency === "UAH" && currency !== "UAH";
  const reference = referenceState.currency === currency ? referenceState.value : null;
  const referencePending = referenceApplicable && referenceState.currency !== currency;
  const referenceFailed = referenceApplicable && referenceState.currency === currency && referenceState.failed;
  const referenceLine = referenceApplicable ? <div aria-live="polite" className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-[var(--ui-text-secondary)]">{referenceAmount && reference && reporting ? <span>{t("builder.reference", { amount: formatFinanceAmount(referenceAmount, reporting, locale), date: new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(reference.effectiveDate)), rate: new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(Number(reference.rate)), currency })}</span> : referencePending ? <span>{t("builder.referenceLoading")}</span> : referenceFailed ? <><span>{t("builder.referenceUnavailable", { currency })}</span><button type="button" className="inline-flex min-h-9 items-center gap-1 rounded px-2 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => { setReferenceState({ currency: "", failed: false, value: null }); setReferenceAttempt((attempt) => attempt + 1); }}><RefreshCw className="size-3.5" aria-hidden="true"/>{t("builder.referenceRetry")}</button></> : null}</div> : null;
  const currencyField = project.hasDesignHistory ? <FormField label={t("builder.currencyShort")}><Input aria-label={t("project.currency")} value={currency} readOnly className={compactControl}/></FormField> : <FormField label={t("builder.currencyShort")}><FinanceCurrencySelect name="currency" aria-label={t("project.currency")} className={compactControl} size="compact" currencies={currencies} reportingCurrency={reportingCurrency} value={currency} onValueChange={setCurrency}/></FormField>;
  const vatControls = <FinanceVatControls hidePreview amount={agreedAmount} vatRate={vatRate} priceBasis={priceBasis} digits={digits} money={money} onRateChange={(rate) => { setVatRate(rate); if (rate !== null && !priceBasis) setPriceBasis("net"); else if (rate === null) setPriceBasis(null); }} onBasisChange={setPriceBasis} labels={{ vat: t("builder.vat"), rate: t("builder.vatRate"), custom: t("builder.vatOther"), none: t("builder.vatNone"), basis: t("builder.priceBasis"), net: t("builder.netShort"), gross: t("builder.grossShort"), customRate: t("builder.customRate") }}/>;
  const discountControls = <div className="space-y-2" data-project-discount>
    <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,15.25rem)_minmax(0,12rem)]"><RateChips label={t("builder.discount")} value={discountType} choices={[{ value: "none", label: t("builder.discountNone") }, { value: "percentage", label: "%" }, { value: "fixed", label: t("builder.discountFixed") }]} onChange={type => { if (type === "none" || type === "percentage" || type === "fixed") changeDiscount(type, discountValue); }}/>
    {discountType !== "none" ? <FormField label={t(discountType === "percentage" ? "builder.discountPercent" : "builder.discountAmount")} className={cn("min-w-0", discountType === "percentage" && "sm:max-w-28")}><Input aria-label={t(discountType === "percentage" ? "builder.discountPercent" : "builder.discountAmount")} inputMode="decimal" value={discountValue} onChange={event => changeDiscount(discountType, event.target.value)} className={compactControl}/></FormField> : null}</div>
    {discountType !== "none" && discountAmount ? <p className="text-xs text-[var(--ui-text-secondary)]" aria-live="polite">{discountType === "percentage" ? `−${money(discountAmount)}` : `${discountPercentage}%`}</p> : null}
  </div>;
  const priceSummary = agreedAmount && totalGross ? <div data-price-summary className="min-w-0 self-start lg:pt-7">
    <AnimatedFormContent isOpen={method === "area"}><p className="ui-numeric mb-4 text-xs text-[var(--ui-text-secondary)]">{area || "—"} m² × {rate || "—"} {currency}/m² = {total ? money(total) : "—"}</p></AnimatedFormContent>
    <dl data-discount-breakdown={discountType !== "none" ? "" : undefined} aria-live="polite" className="space-y-2 text-sm text-[var(--ui-text-secondary)]">
      {[[t("builder.listPrice"), money(total)], ...(discountType !== "none" ? [[t("builder.discountWithPercent", { percent: discountPercentage }), `−${money(discountAmount)}`], [`${t("builder.agreedPrice")}${vatRate !== null ? ` (${t(priceBasis === "gross" ? "builder.grossShort" : "builder.netShort")})` : ""}`, money(agreedAmount)]] : priceBasis === "gross" ? [[t("builder.netShort"), money(totalNet)]] : []), ...(vatRate !== null ? [[`${priceBasis === "gross" ? t("builder.vatIncluded") : t("builder.vat")} ${vatRate}%`, money(totalVat)]] : [])].map(([label, amount]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4"><dt>{label}</dt><dd className="ui-numeric text-right">{amount}</dd></div>)}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 pt-2 font-semibold text-[var(--ui-text)]"><dt>{t("project.clientTotal")}</dt><dd className="ui-numeric text-right text-lg">{money(totalGross)}</dd></div>
    </dl>
    {referenceLine}
  </div> : null;
  const revenueTaxControls = <RevenueTaxControls net={totalNet} rate={revenueTaxRate} digits={digits} money={money} onRateChange={setRevenueTaxRate} labels={{ title: t("builder.revenueTax"), none: t("builder.revenueTaxNone"), custom: t("builder.vatOther"), customRate: t("builder.revenueTaxCustomRate"), afterTax: t("builder.afterTax") }}/>;
  const zeroMoney = projectMoneyText(BigInt(0), digits);
  const allocationMessage = addGuidance ? "" : allocationPercent ? overAmount !== zeroMoney ? t("builder.allocationOver", { percent: allocationPercent, amount: money(overAmount) }) : remainder !== zeroMoney ? t(allowUnscheduled ? "builder.allocationUnderAllowed" : "builder.allocationUnder", { percent: allocationPercent, amount: money(remainder) }) : t("builder.allocationBalanced", { percent: allocationPercent }) : "";
  const allocationTone = overAmount !== zeroMoney ? "bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]" : remainder !== zeroMoney ? "bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]" : "bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]";
  const rowCopy: RowCopy = { actions: t("builder.paymentActions"), amount: t("movements.amount"), differentDate: t("planning.differentExpectedDate"), drag: "", dueDate: t("planning.dueDate"), expectedDate: t("planning.expectedDate"), moveDown: t("builder.moveDown"), moveUp: t("builder.moveUp"), name: t("builder.paymentName"), percentage: t("builder.percentage"), remove: t("builder.remove"), note: t("builder.clientNote") };

  return <FinanceActionForm action={async (state, form) => { form.set("plan", JSON.stringify({ ...payload, reason: current ? form.get("reason") : t("builder.initialReason") })); return saveFinanceProject(state, form); }} label={t(current ? "builder.saveRevision" : "planning.save")} cancelLabel={t("planning.cancel")} onCancel={onSaved} disabled={!valid} onSaved={onSaved} onPending={onPending} className="min-w-0" fieldsetClassName="min-w-0" actionsClassName="sticky bottom-0 z-20 flex justify-end gap-2 border-t border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 sm:px-6">
    <input type="hidden" name="intent" value="plan"/>
    <div className="space-y-4 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h3 id="project-value-heading" className="font-semibold text-[var(--ui-text)]">{t("builder.pricing")}</h3><SegmentedControl ariaLabel={t("builder.pricingMethod")} className="w-full sm:w-auto [&_button]:min-h-11 sm:[&_button]:min-h-9" value={method} onValueChange={setMethod} items={[{ value: "area", label: t("builder.perAreaShort") }, { value: "fixed", label: t("builder.fixedShort") }]}/></div>
      <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-8" data-pricing-layout>
        <div className="min-w-0 space-y-3" data-pricing-controls>
          <div>
            <AnimatedFormContent isOpen={method === "area"}><div className="grid gap-3 sm:grid-cols-[8rem_6.5rem_6rem] sm:items-end"><FormField label={t("builder.areaShort")}><Input aria-label={t("builder.area")} inputMode="decimal" value={area} onChange={(event) => setArea(event.target.value)} required={method === "area"} className={compactControl}/></FormField><FormField label={t("builder.rateShort")}><Input aria-label={t("builder.rate")} inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} required={method === "area"} className={compactControl}/></FormField>{currencyField}</div></AnimatedFormContent>
            <AnimatedFormContent isOpen={method === "fixed"}><div className="grid gap-3 sm:grid-cols-[15.25rem_6rem] sm:items-end"><FormField label={t("project.contract")}><Input aria-label={t("project.contract")} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} required={method === "fixed"} className={compactControl}/></FormField>{currencyField}</div></AnimatedFormContent>
          </div>
          {discountControls}{vatControls}{revenueTaxControls}
        </div>
        {priceSummary}
      </div>
      <AnimatedFormContent isOpen={showAreaMismatch}><div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-warning-surface)] px-3 py-2 text-sm text-[var(--ui-warning-text)]"><p>{t("builder.areaChanged", { saved: pricing?.area_snapshot ?? 0, current: project.area ?? 0 })}</p><Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => setArea(String(project.area))}>{t("builder.useCurrentArea")}</Button></div></AnimatedFormContent>
    </div>
    <section className="space-y-3 border-t border-[var(--ui-border)] px-4 py-5 sm:px-6" aria-labelledby="payment-schedule-heading">
      <h3 id="payment-schedule-heading" className="font-semibold text-[var(--ui-text)]">{t("builder.schedule")}</h3>
      {protectedItems.length ? <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] px-3 py-2.5 text-sm"><p className="flex items-center gap-2 font-medium text-[var(--ui-text)]"><LockKeyhole aria-hidden="true" className="size-4 shrink-0"/>{t("builder.protectedHelp")}</p><ul className="mt-2 divide-y divide-[var(--ui-border)]">{protectedItems.map((item) => <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 first:pt-0 last:pb-0"><span className="min-w-0 truncate text-[var(--ui-text-secondary)]">{item.description}</span><span className="ui-numeric font-medium text-[var(--ui-text)]">{money(item.amount)}</span><Input aria-label={t("builder.clientNote")} placeholder={t("builder.clientNote")} value={protectedNotes.find((note) => note.id === item.id)?.clientNote ?? ""} maxLength={300} className="col-span-2 h-9 text-xs" onChange={(event) => setProtectedNotes((notes) => notes.map((note) => note.id === item.id ? { ...note, clientNote: event.target.value } : note))}/></li>)}</ul></div> : null}
      <AnimatedFormContent isOpen={protectedItems.length > 0}><FormField label={t("builder.strategy")} className="max-w-xl"><Select aria-label={t("builder.strategy")} value={strategy} onValueChange={selectStrategy} size="compact"><SelectItem value="redistribute">{t("builder.redistribute")}</SelectItem><SelectItem value="keep">{t("builder.keep")}</SelectItem><SelectItem value="manual">{t("builder.manual")}</SelectItem></Select></FormField></AnimatedFormContent>
      <div className="flex flex-wrap items-center gap-2" aria-label={t("builder.templates")}>{projectPaymentTemplates.map((percentages) => { const key = percentages.join("/"), isSelected = selectedTemplate === key; return <Button key={key} type="button" variant="outline" aria-pressed={isSelected} className={cn("min-h-11 px-3 sm:min-h-9", isSelected && "border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-surface)] hover:bg-[var(--ui-text)] hover:text-[var(--ui-surface)]")} onClick={() => applyTemplate(percentages)}>{percentages.join(" / ")}{percentages.length === 1 ? "%" : ""}</Button>; })}<Button type="button" variant="outline" aria-pressed={selectedTemplate === "custom"} className={cn("min-h-11 px-3 sm:min-h-9", selectedTemplate === "custom" && "border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-surface)] hover:bg-[var(--ui-text)] hover:text-[var(--ui-surface)]")} onClick={() => selectStrategy("manual")}>{t("builder.custom")}</Button><Button type="button" variant="ghost" className="min-h-11 px-2 text-[var(--ui-text-secondary)] sm:ml-auto sm:min-h-9" onClick={() => { discountScheduleBase.current = null; setRows([]); setStrategy("manual"); setAllowUnscheduled(true); setAddGuidance(false); }}>{t("builder.scheduleLater")}</Button></div>
      <div data-template-transition><AnimatedFormContent isOpen><div className="space-y-3">
        <div className={cn("hidden text-xs font-medium text-[var(--ui-text-muted)]", strategy === "redistribute" ? "lg:grid lg:grid-cols-[2.75rem_minmax(10rem,2fr)_6rem_9rem_10.5rem_2.75rem] lg:gap-x-2" : "lg:grid lg:grid-cols-[2.75rem_minmax(10rem,2fr)_9rem_10.5rem_2.75rem] lg:gap-x-2")} aria-hidden="true"><span/><span>{rowCopy.name}</span>{strategy === "redistribute" ? <span>{rowCopy.percentage}</span> : null}<span>{rowCopy.amount}</span><span>{rowCopy.dueDate}</span><span/></div>
        <DragDropProvider sensors={paymentSensors} onDragEnd={handleDragEnd}><ol className="divide-y divide-[var(--ui-border)] border-y border-[var(--ui-border)]">{rows.map((row, index) => <PaymentRow key={row.key} amount={amounts[index] ?? ""} copy={{ ...rowCopy, drag: t("builder.dragPayment", { name: row.name || index + 1 }) }} index={index} locale={locale} money={money} onMove={move} onRemove={(rowIndex) => { discountScheduleBase.current = null; setAddGuidance(false); setRows((old) => old.filter((_, currentIndex) => currentIndex !== rowIndex)); }} onUpdate={update} row={row} rowCount={rows.length} strategy={strategy}/>)}</ol></DragDropProvider>
      </div></AnimatedFormContent></div>
      <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" className="min-h-11 gap-2 sm:min-h-9" onClick={addPayment}><Plus className="size-4"/>{t("project.addPayment")}</Button>{addGuidance ? <p role="status" className="text-sm text-[var(--ui-warning-text)]">{t("builder.fullyAllocated")}</p> : null}</div>
    </section>
    <section className="space-y-3 border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-4 py-4 sm:px-6" aria-label={t("builder.reconciliation")}>
      {allocationMessage ? <p role={overAmount !== zeroMoney ? "alert" : "status"} className={cn("rounded-[var(--ui-radius-control)] px-3 py-2 text-sm font-medium", allocationTone)}>{allocationMessage}</p> : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-5" aria-live="polite">{([[vatRate === null ? "project.contract" : "project.clientTotal", totalGross], [vatRate === null ? "project.collected" : "project.collectedGross", collected], ["builder.protectedValue", protectedValue], ["builder.newSchedule", scheduled], [vatRate === null ? "project.unscheduled" : "project.unscheduledGross", remainder]] as const).map(([key, amount]) => <div key={key} className="min-w-0"><dt className="text-xs text-[var(--ui-text-muted)]">{t(key)}</dt><dd className="ui-numeric mt-0.5 truncate font-semibold text-[var(--ui-text)]">{amount ? money(amount) : "—"}</dd></div>)}</dl>
      <AnimatedFormContent isOpen={hasRemainder || allowUnscheduled}><div className="grid gap-2 pt-1 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end"><label className="flex min-h-11 items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={allowUnscheduled} onChange={(event) => setAllowUnscheduled(event.target.checked)}/>{t("builder.allowUnscheduled")}</label>{allowUnscheduled && strategy === "redistribute" ? <FormField label={t("project.unscheduled")}><Input value={reserve} inputMode="decimal" onChange={(event) => setReserve(event.target.value)} className={compactControl}/></FormField> : null}</div></AnimatedFormContent>
      <AnimatedFormContent isOpen={Boolean(error)}><p role="status" className="rounded-[var(--ui-radius-control)] bg-[var(--ui-warning-surface)] px-3 py-2 text-sm text-[var(--ui-warning-text)]">{error}</p></AnimatedFormContent>
      {current ? <FormField label={t("project.reason")} className="max-w-2xl"><Textarea name="reason" required maxLength={2000} rows={2}/></FormField> : <input type="hidden" name="reason" value={t("builder.initialReason")}/>}
    </section>
  </FinanceActionForm>;
}
