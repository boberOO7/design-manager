import { describe, expect, it } from "vitest";
import { recurringArrangementInputSchema, expenseReceiptInputSchema } from "./finance-expenses";
const id = "61000000-0000-4000-8000-000000000001";
describe("Expense evidence boundaries", () => {
  it("requires an actual receipt date and explicit confirmation regardless of cash/invoice state", () => {
    const source = { requestId: id, kind: "expected", sourceId: id, version: "1", paid: true, established: true, dueDate: "2026-10-19" };
    expect(expenseReceiptInputSchema.safeParse(source).success).toBe(false);
    expect(expenseReceiptInputSchema.safeParse({ ...source, date: "2026-10-19" }).success).toBe(false);
    expect(expenseReceiptInputSchema.safeParse({ ...source, date: "2026-10-19", confirmed: "true" }).success).toBe(true);
  });
  it("validates only an explicit exceptional arrangement, leaving ordinary schedule coverage to the source", () => {
    expect(recurringArrangementInputSchema.safeParse({}).success).toBe(false);
    expect(recurringArrangementInputSchema.safeParse({ policy: "manual" }).success).toBe(true);
    expect(recurringArrangementInputSchema.safeParse({ policy: "service_days", serviceStart: "2026-10-15" }).success).toBe(true);
    expect(recurringArrangementInputSchema.safeParse({ policy: "period_end" }).success).toBe(true);
    expect(recurringArrangementInputSchema.safeParse({ policy: "calendar_year" }).success).toBe(false);
    expect(recurringArrangementInputSchema.safeParse({ policy: "manual", projectId: "other-studio" }).success).toBe(false);
  });
});
