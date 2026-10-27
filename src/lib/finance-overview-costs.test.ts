import { describe, expect, it } from "vitest";
import { overviewRecordedTripCosts, overviewTripCostSchema, overviewCostSubtotal } from "./finance-overview-costs";
import { recognitionEntrySchema } from "./finance-management";

const id = (n: number) => `82000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const today = "2026-10-18";
const trip = (values: Partial<ReturnType<typeof overviewTripCostSchema.parse>> = {}) => overviewTripCostSchema.parse({
  id: id(1), trip_id: id(2), movement_id: id(3), expected_item_id: null, reverses_id: null,
  financial_date: "2026-08-01", fx_effective_date: "2026-08-01", net_amount: "100.00",
  net_reporting_amount: "4000.00", reporting_currency: "UAH", trip: { project_id: id(4) }, ...values,
});
const history = () => recognitionEntrySchema.parse({
  id: id(10), kind: "recognition", classification: "direct_cost", source_kind: "trip", trip_entry_id: id(1),
  terms_id: null, expected_item_id: null, movement_id: null, project_id: id(4), category_id: id(11),
  source_snapshot: {}, period_start: "2026-08-01", period_end: "2026-08-01", recognized_on: "2026-08-01",
  description: "Trip expense", currency: "USD", amount: "100.00", vat_amount: "0", gross_amount: "100.00",
  reporting_currency: "UAH", reporting_amount: "4000.00", fx_rate: "40", fx_source: "manual", fx_effective_date: "2026-08-01",
  related_entry_id: null, reason: "Actual", created_at: "2026-08-01T12:00:00Z",
});

describe("Overview recorded actual trip costs", () => {
  it("includes project-linked actuals before recognition activation using the canonical net refund amount", () => {
    const actual = trip({ net_amount: "75.00", net_reporting_amount: "3000.00" });
    expect(overviewRecordedTripCosts([actual, actual], [], today, "UAH", 2, new Map()))
      .toEqual([{ projectId: id(4), amount: "3000.00" }]);
    expect(overviewRecordedTripCosts([trip({ net_amount: "0", net_reporting_amount: "0" })], [], today, "UAH", 2, new Map())[0].amount).toBe("0.00");
  });
  it("excludes corrected originals, reversal entries, future entries and studio-only costs", () => {
    const reversal = trip({ id: id(5), reverses_id: id(1) });
    const replacement = trip({ id: id(6), net_reporting_amount: "2000.00" });
    const result = overviewRecordedTripCosts([trip(), reversal, replacement,
      trip({ id: id(7), financial_date: "2026-10-19" }), trip({ id: id(8), trip: { project_id: null } })], [], today, "UAH", 2, new Map());
    expect(result).toEqual([{ projectId: id(4), amount: "2000.00" }]);
  });
  it("does not count recognized sources again or resurrect cancelled/corrected recognition history", () => {
    const recognized = history();
    for (const entry of [recognized, { ...recognized, kind: "reversal" as const },
      { ...recognized, trip_entry_id: null, movement_id: id(3) },
      { ...recognized, trip_entry_id: null, expected_item_id: id(9) }]) {
      expect(overviewRecordedTripCosts([trip({ expected_item_id: id(9) })], [entry], today, "UAH", 2, new Map())).toEqual([]);
    }
  });
  it("uses historical display FX and keeps missing valuation distinct from zero or a known subtotal", () => {
    const values = overviewRecordedTripCosts([trip(), trip({ id: id(5), net_reporting_amount: null })], [], today, "USD", 2,
      new Map([["UAH:2026-08-01", "0.025"]]));
    expect(overviewCostSubtotal(values.map(row => row.amount), 2)).toEqual({ amount: "100.00", count: 2, unknown: 1 });
    expect(overviewCostSubtotal(overviewRecordedTripCosts([trip()], [], today, "USD", 2, new Map()).map(row => row.amount), 2))
      .toEqual({ amount: null, count: 1, unknown: 1 });
    expect(overviewCostSubtotal([], 2)).toEqual({ amount: null, count: 0, unknown: 0 });
  });
});
