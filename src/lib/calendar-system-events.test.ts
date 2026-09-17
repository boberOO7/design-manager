import { describe, expect, it } from "vitest";
import { annualCalendarDate, buildCalendarSystemEvents, normalizePayrollCalendar } from "./calendar-system-events";

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

  it("starts team anniversaries one full year after the join date and retains completed years", () => {
    const recentMember = { ...member, joinedAt: "2026-08-25" };

    expect(buildCalendarSystemEvents([recentMember], "2026-08-25", "2026-08-25").filter((item) => item.source === "team_anniversary")).toEqual([]);
    expect(buildCalendarSystemEvents([recentMember], "2027-08-25", "2029-08-25").filter((item) => item.source === "team_anniversary")).toEqual([
      expect.objectContaining({ startDate: "2027-08-25", anniversaryYears: 1 }),
      expect.objectContaining({ startDate: "2028-08-25", anniversaryYears: 2 }),
      expect.objectContaining({ startDate: "2029-08-25", anniversaryYears: 3 }),
    ]);
  });

  it("does not generate an event when the source date is outside the visible range", () => {
    expect(buildCalendarSystemEvents([member], "2026-03-01", "2026-12-30")).toEqual([]);
  });

  it("membership dates never generate salary reminders", () => {
    expect(buildCalendarSystemEvents([member], "2026-01-01", "2026-12-31").some((item) => item.source === "salary_payment")).toBe(false);
  });

  it("projects Finance payroll with stable item IDs and includes the admin's own obligation", () => {
    const rows = [{ studio_id: "studio", expected_item_id: "expected", employee_id: "admin", employee_name: "Administrator", payment_date: "2026-02-28" }];
    const result = normalizePayrollCalendar(rows);
    expect(result).toEqual([{
      source: "salary_payment", key: "salary-payment:expected", id: "expected", title: "Administrator",
      startDate: "2026-02-28", endDate: "2026-02-28", allDay: true, projectId: null,
      personIds: ["admin"], member: { userId: "admin", fullName: "Administrator", avatarUrl: null },
    }]);
    expect(normalizePayrollCalendar([{ ...rows[0], payment_date: "2026-03-10" }])[0].key).toBe(result[0].key);
    expect(normalizePayrollCalendar([{ ...rows[0], payment_date: null }])).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/amount|currency|paid|settled/);
  });
});
