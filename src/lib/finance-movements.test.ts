import { describe, expect, it } from "vitest";
import { movementInputSchema, financeRateSchema, validateMovementAccounts } from "./finance-movements";
import type { FinanceAccount } from "./finance";

const first = "63000000-0000-4000-8000-000000000020";
const second = "63000000-0000-4000-8000-000000000021";
const base = { requestId: first, kind: "incoming", date: "2026-09-02", accountId: first, amount: "12,34", categoryId:first };
const account = (id: string, currency: string): FinanceAccount => ({ id, currency, name: "Bank", studio_id: first, archived_at: null, created_at: "", updated_at: "", created_by: first, opening_fx_effective_date:null,opening_fx_rate:null,opening_fx_source:null,opening_reporting_amount:null,opening_valued_at:null,opening_valued_by:null,opening_balance: 0 });

describe("actual movement inputs", () => {
  it("keeps decimal amounts as normalized strings through the RPC boundary", () => {
    expect(movementInputSchema.parse(base)).toMatchObject({ amount:"12.34",allocationIntent:false });
    expect(movementInputSchema.parse({ ...base,allocationIntent:"true" }).allocationIntent).toBe(true);
    for (const amount of ["0", "-1", "1e3", "NaN", "Infinity", "1.12345", "10000000000"]) expect(movementInputSchema.safeParse({ ...base, amount }).success).toBe(false);
  });
  it("requires distinct transfer accounts and both actual amounts", () => {
    expect(movementInputSchema.safeParse({ ...base, kind: "transfer" }).success).toBe(false);
    expect(movementInputSchema.safeParse({ ...base, kind: "transfer", destinationId: first, receivedAmount: "10" }).success).toBe(false);
    expect(movementInputSchema.safeParse({ ...base, destinationId: second }).success).toBe(false);
    expect(movementInputSchema.safeParse({ ...base, kind: "refund" }).success).toBe(false);
  });
  it("validates active accounts, currency minor units, and same-currency equality", () => {
    const currencies = [{ code: "UAH", minor_units: 2 }, { code: "JPY", minor_units: 0 }];
    const input = movementInputSchema.parse({ ...base, kind: "transfer", destinationId: second, receivedAmount: "10" });
    expect(validateMovementAccounts(input, [account(first,"UAH"),account(second,"UAH")],currencies)).toBe(false);
    expect(validateMovementAccounts(input, [account(first,"UAH"),account(second,"JPY")],currencies)).toBe(true);
    expect(validateMovementAccounts({ ...input, receivedAmount: "10.1" }, [account(first,"UAH"),account(second,"JPY")],currencies)).toBe(false);
    expect(validateMovementAccounts(input, [{ ...account(first,"UAH"), archived_at: "2026-09-01" },account(second,"JPY")],currencies)).toBe(false);
  });
  it("rejects zero, nonfinite, negative, and imprecise manual FX", () => {
    expect(financeRateSchema.parse("42,1234567890")).toBe("42.1234567890");
    for (const rate of ["", "0", "-1", "Infinity", "1e2", "1.12345678901", "1000000001"]) expect(financeRateSchema.safeParse(rate).success).toBe(false);
  });
});
