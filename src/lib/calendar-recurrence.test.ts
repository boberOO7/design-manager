import { describe, expect, it } from "vitest";
import { occurrenceBounds, recurrenceDates } from "./calendar-recurrence";

describe("calendar recurrence", () => {
  it("generates selected weekdays without persisting future rows", () => {
    expect(recurrenceDates("2026-08-03", "2026-08-01", "2026-08-16", { frequency: "weekly", interval: 1, weekdays: [1, 3], endsOn: null, occurrenceCount: null })).toEqual(["2026-08-03", "2026-08-05", "2026-08-10", "2026-08-12"]);
  });

  it("retains Europe/Kyiv wall time across generated occurrences", () => {
    expect(occurrenceBounds("2026-10-20T06:00:00.000Z", "2026-10-20T07:00:00.000Z", false, "2026-10-27")).toEqual({ startsAt: "2026-10-27T07:00:00.000Z", endsAt: "2026-10-27T08:00:00.000Z" });
  });
});
