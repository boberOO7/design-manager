import { expect, it } from "vitest";
import { projectIncomeSchema } from "./finance-project-income";

const id = "64000000-0000-4000-8000-000000000100";
const expected = { requestId: id, projectId: id, direction: "incoming", stream: "contractor_bonus", mode: "expected", amount: "12,34", currency: "UAH", categoryId: id, commitment: "agreed", certainty: "fixed", established: "false" };
const received = { ...expected, mode: "received", commitment: "agreed", established: "true", accountId: id, date: "2026-11-04" };

it("accepts agreed fixed bonus planning without treating it as received cash", () => {
  expect(projectIncomeSchema.parse(expected)).toMatchObject({ amount: "12.34", direction: "incoming", commitment: "agreed", certainty: "fixed", established: "false" });
});
it("requires a factual date and account for received income", () => {
  expect(projectIncomeSchema.safeParse(received).success).toBe(true);
  for (const patch of [{ date: "" }, { accountId: "" }, { commitment: "tentative" }, { certainty: "estimated" }, { established: "false" }]) {
    expect(projectIncomeSchema.safeParse({ ...received, ...patch }).success).toBe(false);
  }
});
it("retains the existing receivable invariant", () => {
  expect(projectIncomeSchema.safeParse({ ...expected, commitment: "tentative", established: "true" }).success).toBe(false);
});
it("excludes contract/supervision shortcuts, outgoing cash, existing items and unrelated contractors", () => {
  for (const patch of [{ stream: "design" }, { stream: "supervision" }, { direction: "outgoing" }, { id }, { stream: "other", contractorId: id }]) {
    expect(projectIncomeSchema.safeParse({ ...expected, ...patch }).success).toBe(false);
  }
});
