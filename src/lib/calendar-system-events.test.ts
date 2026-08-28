import { describe, expect, it } from "vitest";
import { annualCalendarDate, buildCalendarSystemEvents, monthlyCalendarDate } from "./calendar-system-events";

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

  it("generates admin-enabled monthly payment reminders with stable IDs and month-end dates", () => {
    const monthEndMember = { ...member, joinedAt: "2025-01-31" };
    const items = buildCalendarSystemEvents([monthEndMember], "2026-02-01", "2026-06-30", { includeSalaryPayments: true });

    expect(items.filter((item) => item.source === "salary_payment")).toEqual([
      expect.objectContaining({ id: "salary-payment:membership-1:2026-02", startDate: "2026-02-28", allDay: true }),
      expect.objectContaining({ id: "salary-payment:membership-1:2026-03", startDate: "2026-03-31", allDay: true }),
      expect.objectContaining({ id: "salary-payment:membership-1:2026-04", startDate: "2026-04-30", allDay: true }),
      expect.objectContaining({ id: "salary-payment:membership-1:2026-05", startDate: "2026-05-31", allDay: true }),
      expect.objectContaining({ id: "salary-payment:membership-1:2026-06", startDate: "2026-06-30", allDay: true }),
    ]);
    expect(monthlyCalendarDate("2025-01-31", 2024, 2)).toBe("2024-02-29");
  });

  it("starts payment reminders one full month after work starts", () => {
    const recentMember = { ...member, joinedAt: "2026-08-25" };
    const payments = buildCalendarSystemEvents([recentMember], "2026-08-01", "2026-10-31", { includeSalaryPayments: true })
      .filter((item) => item.source === "salary_payment");

    expect(payments).toEqual([
      expect.objectContaining({ id: "salary-payment:membership-1:2026-09", startDate: "2026-09-25" }),
      expect.objectContaining({ id: "salary-payment:membership-1:2026-10", startDate: "2026-10-25" }),
    ]);
  });

  it("does not generate an admin's own payment reminder", () => {
    const otherMember = { ...member, membershipId: "membership-2", userId: "user-2", fullName: "Taylor Rowe" };
    const payments = buildCalendarSystemEvents([member, otherMember], "2026-08-01", "2026-08-31", { excludeSalaryPaymentsForUserId: "user-1", includeSalaryPayments: true })
      .filter((item) => item.source === "salary_payment");

    expect(payments).toEqual([expect.objectContaining({ id: "salary-payment:membership-2:2026-08", member: expect.objectContaining({ userId: "user-2" }) })]);
  });

  it("keeps payment reminders out of the default system-event projection", () => {
    expect(buildCalendarSystemEvents([member], "2026-08-01", "2026-08-31").some((item) => item.source === "salary_payment")).toBe(false);
  });

  it("does not generate payment reminders for members without a work start date", () => {
    const items = buildCalendarSystemEvents([{ ...member, joinedAt: null }], "2026-08-01", "2026-08-31", { includeSalaryPayments: true });
    expect(items.some((item) => item.source === "salary_payment")).toBe(false);
  });
});
