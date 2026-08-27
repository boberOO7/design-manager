import { describe, expect, it } from "vitest";
import { annualCalendarDate, buildCalendarSystemEvents } from "./calendar-system-events";

const member = {
  membershipId: "membership-1",
  userId: "user-1",
  fullName: "Avery Stone",
  avatarUrl: null,
  birthDate: "1992-02-29",
  joinedAt: "2021-12-31T10:00:00.000Z",
};

describe("calendar system events", () => {
  it("uses Feb 28 for Feb 29 annual occurrences in non-leap years", () => {
    expect(annualCalendarDate("1992-02-29", 2025)).toBe("2025-02-28");
    expect(annualCalendarDate("1992-02-29", 2024)).toBe("2024-02-29");
  });

  it("derives source-qualified all-day events across a year boundary", () => {
    const items = buildCalendarSystemEvents([member], "2025-12-29", "2026-03-02");

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "team_anniversary", id: "anniversary:membership-1:2025", startDate: "2025-12-31", allDay: true }),
      expect.objectContaining({ source: "birthday", id: "birthday:user-1:2026", startDate: "2026-02-28", allDay: true }),
    ]));
    expect(items.find((item) => item.source === "birthday")?.title).toBe("Avery Stone");
  });

  it("does not generate an event when the source date is outside the visible range", () => {
    expect(buildCalendarSystemEvents([member], "2026-03-01", "2026-12-30")).toEqual([]);
  });
});
