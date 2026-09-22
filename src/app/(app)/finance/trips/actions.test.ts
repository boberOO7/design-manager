import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), prior: vi.fn(), fx: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: mocks.fx }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { saveFinanceTrip } from "./actions";
import { tripEntrySchema } from "@/lib/finance-trips";
const id = "79000000-0000-4000-8000-000000000001";
const input = { intent: "entry", requestId: id, tripId: id, kind: "expense", expenseType: "travel", amount: "100", currency: "UAH", date: "2026-09-12", employeeId: id };
const form = (patch = {}) => { const f = new FormData(); for (const [k,v] of Object.entries({ ...input, ...patch })) f.set(k, v); return f; };
beforeEach(() => {
  vi.resetAllMocks(); mocks.admin.mockResolvedValue({ studio_id: "verified" }); mocks.prior.mockResolvedValue({ data: null, error: null }); mocks.rpc.mockResolvedValue({ data: id, error: null });
  const query = { select: () => query, eq: () => query, maybeSingle: mocks.prior, single: async () => ({ data: { base_currency: "UAH" }, error: null }) };
  mocks.client.mockResolvedValue({ from: () => query, rpc: mocks.rpc }); mocks.fx.mockResolvedValue({ rate: "1", source: "identity", effectiveDate: "2026-09-12" });
});
it("denies employee access before querying", async () => {
  mocks.admin.mockResolvedValue(null); expect((await saveFinanceTrip({ status: "idle" }, form())).status).toBe("error"); expect(mocks.client).not.toHaveBeenCalled();
});
it("uses verified tenancy and the atomic trip boundary", async () => {
  expect((await saveFinanceTrip({ status: "idle" }, form())).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("record_finance_trip_entry", expect.objectContaining({ p_studio_id: "verified", p_input: expect.objectContaining({ employeeId: id, amount: "100" }) }));
  expect(mocks.revalidate).toHaveBeenCalledWith("/projects/[projectId]", "page");
});
it("recovers a lost response without FX or a new posting", async () => {
  mocks.prior.mockResolvedValue({ data: { result_id: id, payload: { input: { submission: tripEntrySchema.parse(input) } } }, error: null });
  expect((await saveFinanceTrip({ status: "idle" }, form())).status).toBe("success"); expect(mocks.fx).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  expect((await saveFinanceTrip({ status: "idle" }, form({ amount: "101" }))).message).toBe("errors.conflict");
});
it("preserves matched movement FX and rejects personal cash inputs", async () => {
  await saveFinanceTrip({ status: "idle" }, form({ employeeId: "", movementId: id })); expect(mocks.fx).not.toHaveBeenCalled();
  mocks.rpc.mockClear(); expect((await saveFinanceTrip({ status: "idle" }, form({ accountId: id }))).status).toBe("error"); expect(mocks.rpc).not.toHaveBeenCalled();
});
