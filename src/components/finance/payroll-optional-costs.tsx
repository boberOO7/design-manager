"use client";
import { useTranslations } from "next-intl";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";

type Props = {
  basis: "net" | "gross";
  deductions: string;
  deductionsUnknown: boolean;
  employerCost: string;
  employerStatus: "unknown" | "fixed" | "estimated";
  onDeductions: (value: string) => void;
  onDeductionsUnknown: (unknown: boolean) => void;
  onEmployerCost: (value: string) => void;
  onEmployerStatus: (status: "unknown" | "fixed" | "estimated") => void;
  deductionsName: string;
  deductionsUnknownName: string;
  employerCostName: string;
  employerStatusName: string;
};

export function PayrollOptionalCosts(props: Props) {
  const t = useTranslations("Finance.schedules");
  const hasExtras = props.deductionsUnknown || props.employerStatus !== "fixed" || /[1-9]/.test(props.deductions + props.employerCost);
  return <AnimatedDisclosure title={t("payrollCosts")} defaultOpen={hasExtras}>
    <div className="space-y-3 pb-2 pt-2">
      <p className="text-xs text-[var(--ui-text-muted)]">{t("optionalCostsHelp")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FormField label={t("employeeTaxes")}><Input name={props.deductionsName} value={props.deductions} placeholder="0" inputMode="decimal" disabled={props.deductionsUnknown} onChange={event => props.onDeductions(event.target.value)} /></FormField>
          <input type="hidden" name={props.deductionsUnknownName} value={String(props.deductionsUnknown)} />
          {props.basis === "net" || props.deductionsUnknown ? <Button type="button" variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => props.onDeductionsUnknown(!props.deductionsUnknown)}>{t(props.deductionsUnknown ? "enterKnownAmount" : "clarifyLater")}</Button> : null}
          {props.deductionsUnknown ? <p className="text-xs text-[var(--ui-text-muted)]">{t(props.basis === "gross" ? "grossDeductionsRequired" : "clarifyLater")}</p> : null}
        </div>
        <div>
          <FormField label={t("employerContributions")}><Input name={props.employerCostName} value={props.employerCost} placeholder="0" inputMode="decimal" disabled={props.employerStatus === "unknown"} onChange={event => props.onEmployerCost(event.target.value)} /></FormField>
          <input type="hidden" name={props.employerStatusName} value={props.employerStatus} />
          <Button type="button" variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => props.onEmployerStatus(props.employerStatus === "unknown" ? "fixed" : "unknown")}>{t(props.employerStatus === "unknown" ? "enterKnownAmount" : "clarifyLater")}</Button>
          {props.employerStatus === "estimated" ? <div className="flex items-center gap-2 text-xs text-[var(--ui-text-muted)]"><span>{t("estimated")}</span><Button type="button" variant="ghost" size="sm" onClick={() => props.onEmployerStatus("fixed")}>{t("confirmCostAmount")}</Button></div> : null}
        </div>
      </div>
    </div>
  </AnimatedDisclosure>;
}
