import { beforeEach, expect, it, vi } from "vitest";
import { projectIncomeSchema } from "@/lib/finance-project-income";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), prior: vi.fn(), foundation: vi.fn(), fx: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/data/queries/finance", () => ({ getFinanceData: mocks.foundation }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/finance-fx", () => ({ defaultFinanceReportingSource: "nbu", resolveFinanceFx: mocks.fx }));
vi.mock("@/lib/finance-automatic-expenses", () => ({ scheduleAutomaticExpenses: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/validation/project", () => ({ getKyivDateOnly: () => "2026-11-04" }));
import { saveProjectIncome } from "./project-income-actions";

const id = "64000000-0000-4000-8000-000000000100";
function form(patch: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ requestId: id, projectId: id, direction: "incoming", stream: "contractor_bonus", mode: "expected", amount: "12,34", currency: "UAH", categoryId: id, commitment: "agreed", certainty: "fixed", established: "false", ...patch })) form.set(key, value);
  return form;
}
const paid = { mode: "received", commitment: "agreed", established: "true", accountId: id, date: "2026-11-04" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ studio_id: "verified" });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.prior };
  mocks.client.mockResolvedValue({ rpc: mocks.rpc, from: vi.fn(() => query) });
  mocks.prior.mockResolvedValue({ data: null, error: null });
  mocks.rpc.mockResolvedValue({ data: id, error: null });
  mocks.foundation.mockResolvedValue({ settings: { finalized_at: "2026-01-01", base_currency: "UAH" }, accounts: [{ id, currency: "UAH", archived_at: null }] });
  mocks.fx.mockResolvedValue({ rate: "1", source: "identity", effectiveDate: paid.date });
});
it("requires verified admin before accessing the database", async () => {
  mocks.admin.mockResolvedValue(null);
  expect((await saveProjectIncome({ status: "idle" }, form())).status).toBe("error");
  expect(mocks.client).not.toHaveBeenCalled();
});
it("plans income without posting any cash", async () => {
  expect(await saveProjectIncome({ status: "idle" }, form())).toEqual({ status: "success", id });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_finance_project_item", expect.objectContaining({ p_studio_id: "verified", p_input: expect.objectContaining({ stream: "contractor_bonus", item: expect.objectContaining({ amount: "12.34", commitment: "agreed", certainty: "fixed", established: false }) }) }));
  expect(mocks.fx).not.toHaveBeenCalled();
});
it("records already-received income in one atomic call even when reporting FX is unavailable", async () => {
  mocks.fx.mockRejectedValue(new Error("unavailable"));
  expect((await saveProjectIncome({ status: "idle" }, form(paid))).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("record_finance_project_income", expect.objectContaining({ p_studio_id: "verified", p_input: expect.objectContaining({ receipt: { accountId: id, date: paid.date, fx: null }, item: expect.objectContaining({ amount: "12.34", established: true }) }) }));
});
it("resolves lost-response retries before rechecking accounts or fetching FX", async () => {
  const submission = projectIncomeSchema.parse(Object.fromEntries(form(paid)));
  mocks.prior.mockResolvedValue({ data: { result_id: id, payload: { operation: "project_income", project: id, input: { submission } } }, error: null });
  expect(await saveProjectIncome({ status: "idle" }, form(paid))).toEqual({ status: "success", id });
  expect(mocks.foundation).not.toHaveBeenCalled();
  expect(mocks.fx).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects changed retry payloads", async () => {
  const submission = projectIncomeSchema.parse(Object.fromEntries(form({ ...paid, amount: "20" })));
  mocks.prior.mockResolvedValue({ data: { result_id: id, payload: { operation: "project_income", project: id, input: { submission } } }, error: null });
  expect(await saveProjectIncome({ status: "idle" }, form(paid))).toEqual({ status: "error", message: "planning.errors.conflict" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects future receipts and mismatched account currency without writing", async () => {
  expect((await saveProjectIncome({ status: "idle" }, form({ ...paid, date: "2026-11-05" }))).status).toBe("error");
  expect((await saveProjectIncome({ status: "idle" }, form({ ...paid, currency: "USD" }))).status).toBe("error");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not report success or refresh after an atomic failure", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "finance_amount_invalid" } });
  expect((await saveProjectIncome({ status: "idle" }, form(paid))).status).toBe("error");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
