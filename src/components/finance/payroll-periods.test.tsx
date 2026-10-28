import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
const mocks = vi.hoisted(() => ({ cash: vi.fn(), period: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/finance/schedules/payroll-actions", () => ({
  loadFinancePayrollCash: mocks.cash, loadFinancePayrollPeriod: mocks.period,
  confirmFinancePayrollEarning: vi.fn(), loadFinancePayrollPayment: vi.fn(), recordFinancePayrollAdvance: vi.fn(), recordFinancePayrollPayment: vi.fn(),
}));
vi.mock("@/app/(app)/finance/movements/actions", () => ({ quoteFinanceSettlement: vi.fn() }));
import { PayrollPeriods } from "./payroll-earning";
import type { FinanceSchedulesData } from "@/data/queries/finance";

function render(periods: FinanceSchedulesData["payrollPeriods"]) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="en" timeZone="Europe/Kyiv" messages={en}>
    <PayrollPeriods scheduleId="salary" employeeName="Employee" accounts={[]} currencies={[]} today="2026-09-20" periods={periods} />
  </NextIntlClientProvider>);
}

it("renders the month and both actions immediately from server data", () => {
  const html = render([{ id: "month", schedule_id: "salary", period_start: "2026-09-01" }]);
  expect(html).toContain("September 2026");
  expect(html).toContain(en.Finance.payrollEarning.open);
  expect(html).toContain(en.Finance.payrollCash.advance);
  expect(html).not.toContain(en.Finance.payrollEarning.loading);
  expect(mocks.cash).not.toHaveBeenCalled();
  expect(mocks.period).not.toHaveBeenCalled();
});

it("keeps advances available when there are no payable months", () => {
  const html = render([]);
  expect(html).toContain(en.Finance.payrollCash.advance);
  expect(html).not.toContain(en.Finance.payrollEarning.open);
  expect(html).not.toContain(en.Finance.payrollEarning.loading);
});
