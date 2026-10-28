import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { OverviewProjectEconomics } from "./overview-project-economics";
import type { OverviewProjectEconomics as Economics } from "@/lib/finance-overview-economics";
vi.mock("@/components/statistics/statistics-motion", () => ({ StatisticsMotion: ({ children }: { children: React.ReactNode }) => children }));

it("renders missing costs as zero with the regular bar style and exposes the missing labor schedule", () => {
  const projects = [null, "0.00", "125.00"].map((knownCosts, index) => ({
    id: `project-${index}`, name: `Project ${index}`, contract: "1000.00", costs: knownCosts, knownCosts,
    pendingExpenseCosts: null, missingPendingExpenseFx: 0, pendingExpenseIncomplete: false, recordedCosts: null, recordedCount: 0,
    provisionalCosts: null, historicalCosts: null, historicalIncomplete: index === 0, historicalIssues: index === 0 ? ["missing_capacity"] : [],
    costsIncomplete: index !== 1, missingRecognizedFx: 0, missingRecordedFx: 0, provisionalIncomplete: false,
    reasons: [], contribution: null, margin: null, area: "100", completed: false,
  }));
  const data: Economics & { currency: { code: string; minor_units: number }; asOf: string } = {
    currency: { code: "UAH", minor_units: 2 }, asOf: "2026-10-21", projects,
    averageContract: "1000.00", averageMargin: null, contractPerArea: "10.00", contributionPerArea: null,
    counts: { completed: 0, priced: 3, costed: 0, withArea: 3, costedWithArea: 0 },
    coverage: { recognized: 2, recorded: 0, provisional: 0, reasons: [] },
    highlights: { mostExpensive: projects[0], leastExpensive: projects[2], highestMargin: null, lowestMargin: null },
  };
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" timeZone="Europe/Kyiv" messages={en}><OverviewProjectEconomics data={data}/></NextIntlClientProvider>);
  const label = (index: number) => html.match(new RegExp(`data-economics-point="project-${index}" aria-label="([^"]+)"`))?.[1];
  expect(label(0)).toContain("Known costs: 0.00");
  expect(label(1)).toContain("Known costs: 0.00");
  expect(label(2)).toContain("Known costs: 125.00");
  expect(label(2)).toContain(en.Finance.overview.economics.incompleteShort);
  expect(label(0)).toContain(`${en.Finance.overview.economics.margin}: —`);
  expect(html).not.toContain("border-dashed");
  expect(html).toContain(en.Finance.historicalLabor.issue.missing_capacity);
  expect(html).toContain('href="/finance/reports#labor"');
});
