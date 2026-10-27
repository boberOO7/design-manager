import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { AutomaticLaborSection } from "./automatic-labor-section";
import type { FinanceLaborData } from "@/lib/finance-labor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/finance/reports/automatic-labor-actions", () => ({ previewAutomaticLabor: vi.fn(), saveAutomaticLabor: vi.fn() }));

const id = "61000000-0000-4000-8000-000000000001";
const base: FinanceLaborData = { missingPeriods: [], sources: [], pools: [], allocations: [], allocationHistory: [], studioDailyMinutes: 480 };
function render(data: FinanceLaborData) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="en" timeZone="Europe/Kyiv" messages={en}>
    <AutomaticLaborSection data={data} projects={[]} currencies={[]} baseCurrency="UAH" from="2026-10-01" to="2026-10-31" today="2026-10-22" recognitionStart="2026-10-22"/>
  </NextIntlClientProvider>);
}

it("proposes the missing payroll-month schedule date without asking for known hours again", () => {
  const html = render(base);
  expect(html).toContain('name="capacityFrom" value="2026-10-01"');
  expect(html).not.toContain('name="dailyMinutes"');
  expect(html).not.toContain('name="internalDesignationConfirmed"');
  expect(html).not.toContain('name="historicalCapacityConfirmed"');
});

it("reuses dated capacity without asking for another historical effective date", () => {
  const html = render({ ...base, capacity: [{ id, employee_id: null, effective_from: "2026-09-01", daily_minutes: 360, weekdays: [1, 2, 3, 4, 5] }] });
  expect(html).not.toContain('name="capacityFrom"');
  expect(html).not.toContain('name="dailyMinutes"');
});

it("keeps the current payroll period and its missing-input repair visible after mid-month posting activation", () => {
  const html = render({ ...base, automation: { startsOn: "2026-10-22", internalProjectId: null }, automaticPeriods: [{
    obligationId: id, employeeId: id, label: "October payroll", periodStart: "2026-10-01", periodEnd: "2026-10-31",
    digest: "a".repeat(32), source: null, expectedMinutes: 480, completedDays: 1, requiredDays: 1,
    missingDates: [], projectIds: [], issues: ["missing_capacity"], manual: false, status: "provisional", shares: {}, pools: [],
  }] });
  expect(html).toContain("October payroll");
  expect(html).toContain(en.Finance.labor.auto.issue.missing_capacity);
});
