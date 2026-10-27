import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), labor: vi.fn(), expenses: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: vi.fn() }));
vi.mock("@/lib/finance-automatic-labor", () => ({ scheduleAutomaticLabor: mocks.labor }));
vi.mock("@/lib/finance-automatic-expenses", () => ({ scheduleAutomaticExpenses: mocks.expenses }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { saveFinanceManagement } from "./actions";
const id = "61000000-0000-4000-8000-000000000001";
function form(approved = "true") {
  const value = new FormData();
  for (const [key, text] of Object.entries({ intent: "month", requestId: id, month: "2026-09-01", digest: "a".repeat(32), revision: "0", approved })) value.set(key, text);
  return value;
}
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ studio_id: id }); mocks.rpc.mockResolvedValue({ data: id, error: null }); });
it("sends one explicit approval and its source boundary to the guarded monthly RPC", async () => {
  expect((await saveFinanceManagement({ status: "idle" }, form())).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledWith("confirm_finance_month", { p_studio_id: id, p_request_id: id,
    p_input: { month: "2026-09-01", digest: "a".repeat(32), revision: 0, approved: "true" } });
});
it("requires verified admin membership and explicit external completeness approval", async () => {
  expect((await saveFinanceManagement({ status: "idle" }, form("false"))).message).toBe("errors.invalid");
  mocks.admin.mockResolvedValue(null);
  expect((await saveFinanceManagement({ status: "idle" }, form())).message).toBe("errors.forbidden");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("returns source exceptions and concurrency conflicts without scheduling processing", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "finance_month_exceptions" } });
  expect((await saveFinanceManagement({ status: "idle" }, form())).message).toBe("errors.monthExceptions");
  mocks.rpc.mockResolvedValue({ error: { message: "finance_version_conflict" } });
  expect((await saveFinanceManagement({ status: "idle" }, form())).message).toBe("errors.conflict");
  expect(mocks.labor).not.toHaveBeenCalled(); expect(mocks.expenses).not.toHaveBeenCalled();
});


it("enables new posting without accepting a user-selected accounting month", async () => {
  const input = new FormData(); input.set("intent", "activation"); input.set("requestId", id); input.set("month", "1990-01-01");
  expect((await saveFinanceManagement({ status: "idle" }, input)).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("enable_finance_recognition", { p_studio_id: id, p_request_id: id });
});
