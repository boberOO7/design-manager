import { z } from "zod";
import { financeAmountText, financeAmountUnits } from "./finance";
import { convertFinanceDisplayAmount } from "./finance-display-report";
import type { RecognitionEntry } from "./finance-management";

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const overviewTripCostSchema = z.object({
  id: z.uuid(), trip_id: z.uuid(), movement_id: z.uuid().nullable(), expected_item_id: z.uuid().nullable(),
  reverses_id: z.uuid().nullable(), financial_date: z.iso.date(), fx_effective_date: z.iso.date().nullable(),
  net_amount: decimal, net_reporting_amount: decimal.nullable(), reporting_currency: z.string(),
  trip: z.object({ project_id: z.uuid().nullable() }),
});
export type OverviewTripCost = z.infer<typeof overviewTripCostSchema>;

/** Recorded trip actuals reuse the trip ledger's net refund/correction valuation.
 * Any recognition history owns its source, including cancelled/corrected facts. */
export function overviewRecordedTripCosts(trips: OverviewTripCost[], history: RecognitionEntry[], today: string,
  currency: string, digits: number, rates: ReadonlyMap<string, string>) {
  const reversed = new Set(trips.flatMap(trip => trip.reverses_id ? [trip.reverses_id] : []));
  const seen = new Set<string>();
  return trips.flatMap(trip => {
    if (!trip.trip.project_id || trip.reverses_id || reversed.has(trip.id) || trip.financial_date > today || seen.has(trip.id)) return [];
    seen.add(trip.id);
    if (history.some(entry => entry.trip_entry_id === trip.id
      || (trip.movement_id !== null && entry.movement_id === trip.movement_id)
      || (trip.expected_item_id !== null && entry.expected_item_id === trip.expected_item_id))) return [];
    const rate = trip.reporting_currency === currency ? "1" : rates.get(`${trip.reporting_currency}:${trip.fx_effective_date ?? trip.financial_date}`);
    const amount = trip.net_reporting_amount === null || !rate ? null : convertFinanceDisplayAmount(trip.net_reporting_amount, rate, digits);
    return [{ projectId: trip.trip.project_id, amount }];
  });
}

export function overviewCostSubtotal(values: Array<string | null>, digits: number) {
  const known = values.filter((value): value is string => value !== null);
  return {
    amount: known.length ? financeAmountText(known.reduce((sum, value) => sum + financeAmountUnits(value, digits), BigInt(0)), digits) : null,
    count: values.length, unknown: values.length - known.length,
  };
}
