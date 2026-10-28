import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), labor: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/finance-automatic-labor", () => ({ scheduleAutomaticLabor: mocks.labor }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/data/queries/finance", () => ({ getFinanceData: vi.fn() }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: vi.fn(), defaultFinanceReportingSource: "nbu" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { confirmFinancePayrollEarning, loadFinancePayrollPeriod } from "./payroll-actions";
const id = "64000000-0000-4000-8000-000000000100";
function form(patch: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ requestId: id, obligationId: id, revision: "1", digest: "a".repeat(32), finalAmount: "0", refreshSource: "false", reason: "Correct payroll", ...patch })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.admin.mockResolvedValue({ studio_id: "verified" }); mocks.client.mockResolvedValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ error: null });
});
it("uses verified tenant, preserves request/version and accepts a zero correction", async () => {
  expect((await confirmFinancePayrollEarning({ status: "idle" }, form({ studioId: "untrusted" }))).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("confirm_finance_payroll_earning", { p_studio_id: "verified", p_request_id: id, p_input: { obligationId: id, revision: 1, digest: "a".repeat(32), finalAmount: "0", refreshSource: false, reason: "Correct payroll" } });
  expect(mocks.labor).toHaveBeenCalledWith("verified");
  expect(mocks.revalidate).toHaveBeenCalledWith("/finance", "layout");
});
it("rejects malformed or unexplained corrections before invoking the RPC", async () => {
  const invalid: Record<string, string>[] = [{ finalAmount: "-1" }, { reason: " " }, { revision: "-1" }, { digest: "old" }, { refreshSource: "yes" }];
  for (const patch of invalid) {
    expect((await confirmFinancePayrollEarning({ status: "idle" }, form(patch))).status).toBe("error");
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("retains explicit source refresh and reports a stale calculation without scheduling writes", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "finance_payroll_preview_stale" } });
  expect(await confirmFinancePayrollEarning({ status: "idle" }, form({ finalAmount: "1250,50", refreshSource: "true" }))).toEqual({ status: "error", message: "schedules.errors.payrollPreviewStale" });
  expect(mocks.rpc).toHaveBeenCalledWith("confirm_finance_payroll_earning", expect.objectContaining({ p_input: expect.objectContaining({ finalAmount: "1250.50", refreshSource: true }) }));
  expect(mocks.labor).not.toHaveBeenCalled();
});
it("denies non-admin reads and writes before creating a client", async () => {
  mocks.admin.mockResolvedValue(null);
  expect(await loadFinancePayrollPeriod(id)).toBeNull();
  expect((await confirmFinancePayrollEarning({ status: "idle" }, form())).status).toBe("error");
  expect(mocks.client).not.toHaveBeenCalled();
});
