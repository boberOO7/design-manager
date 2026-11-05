import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import en from "../../../messages/en.json";
import { PayrollPaymentForm } from "./payroll-payment";
import type { PayrollPayment, PayrollPeriod } from "@/lib/finance-payroll-earnings";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/finance/schedules/payroll-actions", () => ({
  loadFinancePayrollCash: vi.fn(), loadFinancePayrollPayment: vi.fn(), recordFinancePayrollAdvance: vi.fn(), recordFinancePayrollPayment: vi.fn(),
  confirmFinancePayrollEarning: vi.fn(),
}));
vi.mock("@/app/(app)/finance/movements/actions", () => ({ quoteFinanceSettlement: vi.fn() }));

type Props = ComponentProps<typeof PayrollPaymentForm>;
const id = "64000000-0000-4000-8000-000000000100";
const account: Props["accounts"][number] = {
  id, studio_id: id, name: "UAH account", currency: "UAH", account_type: "bank", opening_balance: 0,
  archived_at: null, created_at: "2026-10-01", updated_at: "2026-10-01", created_by: id,
  opening_fx_effective_date: null, opening_fx_rate: null, opening_fx_source: null,
  opening_reporting_amount: null, opening_valued_at: null, opening_valued_by: null,
};
const initial: PayrollPayment = {
  obligationId: id, employeeId: id, employeeName: "Employee", currency: "USD", remaining: "100",
  date: "2026-10-28", rate: "40", paymentCurrency: "UAH", advanceAvailable: "25", advanceUsed: "25", totalPayment: "4000", cashDue: "3000", digest: "a".repeat(32),
};
const period: PayrollPeriod = {
  obligationId: id, scheduleId: id, employeeName: "Employee", periodStart: "2026-10-01", periodEnd: "2026-10-31",
  current: { termsId: id, payMethod: "per_m2", rate: "6", currency: "USD", basis: "net", periodStart: "2026-10-01", periodEnd: "2026-10-31", area: "16.6667", calculatedAmount: "100", sources: [], digest: "b".repeat(32) },
  confirmed: null, paid: "0", expectedItemId: id, sourceChanged: false, history: [],
};
function render(patch: Partial<Props> = {}) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="en" timeZone="Europe/Kyiv" messages={en}>
    <PayrollPaymentForm accounts={[account]} currencies={[{code:"UAH",minor_units:2},{code:"USD",minor_units:2}]} today={initial.date} itemId={id} initial={initial} onSaved={() => {}} onPending={() => {}} {...patch} />
  </NextIntlClientProvider>);
}

it("pays USD earnings in UAH with a rate source, account choice and advances", () => {
  const html = render({ accounts: [account, { ...account, id: "archived", name: "Archived UAH", archived_at: "2026-10-01" }] });
  expect(html).toContain('name="accountId"');
  expect(html).toContain("UAH account");
  expect(html).not.toContain("Archived UAH");
  expect(html).toContain('value="manual"');
  expect(html).toContain('value="nbu"');
  expect(html).toContain("1 USD = 40 UAH");
  expect(html).toContain("25 USD");
  expect(html).toContain('name="amount"');
  expect(html).toContain('value="3000"');
});

it("blocks new cash without an active account but permits credit-only settlement", () => {
  expect(render({ accounts: [] })).toContain(en.Finance.payrollCash.noAccount);
  const html = render({ accounts: [], initial: { ...initial, advanceAvailable: "100", advanceUsed: "100", cashDue: "0" } });
  expect(html).toContain(en.Finance.payrollCash.applyAdvance);
  expect(html).not.toContain('type="submit" disabled');
});

it("keeps payment blocked when there is no exchange rate", () => {
  const html = render({ initial: { ...initial, rate: null, totalPayment: null, cashDue: null } });
  expect(html).toContain(en.Finance.payrollCash.quoteError);
  expect(html).toContain('type="submit" disabled');
});

it("submits both reviewed digests in one payment without an intermediate confirmation form", () => {
  const html = render({ period });
  expect(html).toContain('name="accountId"');
  expect(html).toContain('name="amount"');
  expect(html).toContain('name="mode"');
  expect(html).toContain(`name="digest" value="${initial.digest}"`);
  expect(html).toContain(`name="earningDigest" value="${period.current.digest}"`);
  expect(html).not.toContain('name="finalAmount"');
  expect(html).not.toContain('name="reason"');
  expect(html).toContain(en.Finance.payrollCash.pay);
  expect(html).not.toContain("<textarea");
});

it("uses the payment preview digest directly for an already confirmed earning", () => {
  const html = render({ period: { ...period, confirmed: { revision: 1, source: period.current, calculatedAmount: "100", adjustment: "0", finalAmount: "100", payout: "100", reason: "Confirmed" } } });
  expect(html).toContain(`name="digest" value="${initial.digest}"`);
  expect(html).toContain('name="note"');
  expect(html).not.toContain('name="finalAmount"');
  expect(html).toContain(en.Finance.payrollCash.paymentDescription);
  expect(html).not.toContain("<textarea");
  expect(html).not.toContain('name="earningDigest"');
});

it("pays directly from USD cash without a salary exchange rate", () => {
  const html = render({ accounts: [{ ...account, currency: "USD", account_type: "cash", name: "USD cash" }], initial: { ...initial, paymentCurrency: "USD", rate: "1", totalPayment: "100", cashDue: "75" } });
  expect(html).toContain("USD cash · USD");
  expect(html).toContain("Payment amount · USD");
  expect(html).toContain('name="paymentCurrency" value="USD"');
  expect(html).toContain('value="75"');
  expect(html).not.toContain('value="manual"');
  expect(html).not.toContain("1 USD =");
  expect(html).not.toContain('type="submit" disabled');
});
it("does not submit a UAH preview for a USD account", () => {
  const html = render({ accounts: [{ ...account, currency: "USD" }] });
  expect(html).not.toContain('value="3000"');
  expect(html).toContain('name="digest" value=""');
  expect(html).toContain('type="submit" disabled');
});

it("quotes a UAH salary in the USD account currency", () => {
  const html = render({ accounts: [{ ...account, currency:"USD" }], initial: { ...initial, currency:"UAH", paymentCurrency:"USD", rate:"0.025", totalPayment:"2.5", cashDue:"1.88" } });
  expect(html).toContain("1 UAH = 0.025 USD");
  expect(html).toContain("Payment amount · USD");
  expect(html).toContain('value="manual"');
  expect(html).not.toContain('type="submit" disabled');
});

it.each(["USD","UAH"] as const)("selects the %s salary account before the other currency groups", currency => {
  const accounts = ["EUR","PLN","UAH","USD"].map(code=>({...account,id:code,name:`${code} account`,currency:code}));
  const html = render({ accounts, initial:{...initial,currency,paymentCurrency:currency,rate:"1",totalPayment:"100",cashDue:"75"} });
  const select = html.match(/<select[^>]*name="accountId"[\s\S]*?<\/select>/)?.[0] ?? "";
  const order = currency === "USD" ? ["USD","UAH","PLN","EUR"] : ["UAH","USD","PLN","EUR"];
  expect(select).toContain(`<option value="${currency}" selected="">`);
  for (let index=1;index<order.length;index++) expect(select.indexOf(`value="${order[index-1]}"`)).toBeLessThan(select.indexOf(`value="${order[index]}"`));
  expect(html).toContain('value="75"');
  expect(html).not.toContain('value="manual"');
});

it("prefills zero and applies frozen USD advances without a current conversion quote", () => {
  const html = render({initial:{...initial,rate:null,totalPayment:null,advanceAvailable:"100",advanceUsed:"100",cashDue:"0"}});
  expect(html).toContain('name="amount"');
  expect(html).toContain('value="0"');
  expect(html).toContain(en.Finance.payrollCash.applyAdvance);
  expect(html).not.toContain(en.Finance.payrollCash.quoteError);
  expect(html).not.toContain('type="submit" disabled');
  expect(html).not.toContain('value="manual"');
});
it("prefills the full USD salary when the USD account is selected", () => {
  const html = render({accounts:[{...account,currency:"USD"}],initial:{...initial,remaining:"3000",advanceAvailable:"0",advanceUsed:"0",paymentCurrency:"USD",rate:"1",totalPayment:"3000",cashDue:"3000"}});
  expect(html).toContain('value="3000"');
  expect(html).not.toContain(en.Finance.payrollCash.quoteError);
  expect(html).not.toContain('type="submit" disabled');
});
