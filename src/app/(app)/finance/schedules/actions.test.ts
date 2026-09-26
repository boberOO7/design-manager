import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { saveFinanceSchedule, saveInitialPayroll, saveFinanceGroup, moveFinanceRules } from "./actions";
const id = "64000000-0000-4000-8000-000000000100";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ requestId: id, ...values })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ studio_id: "verified" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ error: null });
});
it("keeps bonus notes optional while preserving explicit dates and entered notes", async () => {
  for (const description of ["", "Personal award"]) {
    const input = { intent: "bonus", employeeId: id, amount: "75", currency: "UAH", periodStart: "2026-09-01", periodEnd: "2026-09-20", dueDate: "2026-10-10", description };
    expect((await saveFinanceSchedule({ status: "idle" }, form(input))).status).toBe("success");
    expect(mocks.rpc).toHaveBeenLastCalledWith("create_finance_employee_bonus", expect.objectContaining({ p_studio_id: "verified", p_input: expect.objectContaining({ description: description || "schedules.addBonus", periodStart: input.periodStart, periodEnd: input.periodEnd, dueDate: input.dueDate }) }));
  }
});
it("defaults a new recurring agreement note but still requires a revision reason", async () => {
  const input = { intent: "schedule", kind: "recurring", revision: "0", name: "Rent", amount: "1000", currency: "UAH", categoryId: id, intervalMonths: "1", payoutDay: "5", effectiveFrom: "2026-09-01", commitment: "agreed", certainty: "fixed", employerCostStatus: "unknown", reason: "" };
  expect((await saveFinanceSchedule({ status: "idle" }, form(input))).status).toBe("success");
  expect(mocks.rpc).toHaveBeenLastCalledWith("save_finance_recurring_schedule", expect.objectContaining({ p_input: expect.objectContaining({ reason: "schedules.defaultRecurringNote", employerCost: "" }) }));
  mocks.rpc.mockClear();
  expect((await saveFinanceSchedule({ status: "idle" }, form({ ...input, id, revision: "1" }))).status).toBe("error");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("checks verified administration before applying defaults or creating a client", async () => {
  mocks.admin.mockResolvedValue(null);
  expect((await saveFinanceSchedule({ status: "idle" }, form({ intent: "bonus" }))).status).toBe("error");
  expect(mocks.client).not.toHaveBeenCalled();
});

it("removes only a validated payroll configuration through the guarded RPC", async () => {
  expect((await saveFinanceSchedule({ status: "idle" }, form({ intent: "remove", scheduleId: id, revision: "1" }))).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("remove_unconsumed_finance_payroll", { p_studio_id: "verified", p_request_id: id, p_schedule_id: id, p_revision: 1 });
  mocks.rpc.mockClear();
  expect((await saveFinanceSchedule({ status: "idle" }, form({ intent: "remove", scheduleId: id, revision: "0" }))).status).toBe("error");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("bulk setup reports partial success and reuses original request IDs on retry", async () => {
  const row = { requestId: id, employeeId: id, id: "", revision: 0, kind: "payroll", name: "Base salary", amount: "1000", currency: "UAH", categoryId: id, intervalMonths: 1, payoutDay: 10, paymentMonthOffset: 1, effectiveFrom: "2026-09-01", commitment: "agreed", certainty: "fixed", basis: "net", employeePayout: "1000", employeeDeductions: "", employerCost: "", employerCostStatus: "unknown", reason: "Agreement" };
  const second = { ...row, employeeId: "64000000-0000-4000-8000-000000000101", requestId: "64000000-0000-4000-8000-000000000102" };
  mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "finance_amount_invalid" } });
  const result = await saveInitialPayroll([row, second]);
  expect(result.rows.map((value) => value.saved)).toEqual([true, false]);
  await saveInitialPayroll([second]);
  expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[2]);
  expect(mocks.rpc).toHaveBeenLastCalledWith("save_finance_schedule", expect.objectContaining({ p_studio_id: "verified", p_input: expect.objectContaining({ id: "", revision: 0, employeeDeductions: "", employerCost: "" }) }));
  mocks.rpc.mockClear();
  expect((await saveInitialPayroll([{ ...row, id }])).error).toBeTruthy();
  expect((await saveInitialPayroll([row, row])).error).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("bulk setup and groups retain the verified admin boundary", async () => {
  mocks.admin.mockResolvedValue(null);
  expect((await saveInitialPayroll([])).error).toBeTruthy();
  expect((await saveFinanceGroup({ status: "idle" }, form({ operation: "assign", scheduleId: id }))).status).toBe("error");
  expect(mocks.client).not.toHaveBeenCalled();
});
it("group moves use only the verified studio and permit ungrouped assignment", async () => {
  expect((await saveFinanceGroup({ status: "idle" }, form({ operation: "assign", scheduleId: id, studioId: "untrusted" }))).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("manage_finance_recurring_group", { p_studio_id: "verified", p_operation: "assign", p_id: undefined, p_name: undefined, p_schedule_id: id });
});

it("bulk organization reports partial results, deduplicates IDs and safely retries assignment", async () => {
  const second = "64000000-0000-4000-8000-000000000101";
  mocks.rpc.mockResolvedValueOnce({ error: null }).mockRejectedValueOnce(new Error("connection lost"));
  expect(await moveFinanceRules({ groupId: id, scheduleIds: [id, second, id] })).toEqual({ moved: [id], error: "schedules.moveRetry" });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(await moveFinanceRules({ groupId: id, scheduleIds: [second] })).toEqual({ moved: [second], error: "" });
  expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[2]);
  expect(mocks.rpc).toHaveBeenLastCalledWith("manage_finance_recurring_group", { p_studio_id: "verified", p_operation: "assign", p_id: id, p_schedule_id: second });
});
it("bulk organization validates IDs and requires verified admin access before mutations", async () => {
  for (const input of [{ groupId: id, scheduleIds: [] }, { groupId: "foreign", scheduleIds: [id] }, { groupId: "", scheduleIds: ["bad"] }]) expect((await moveFinanceRules(input)).error).toBeTruthy();
  expect(mocks.client).not.toHaveBeenCalled();
  mocks.admin.mockResolvedValue(null);
  expect((await moveFinanceRules({ groupId: "", scheduleIds: [id] })).error).toBe("planning.errors.forbidden");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("bulk organization permits Ungrouped and reports guarded RPC failures without claiming success", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { message: "finance_group_invalid" } });
  expect(await moveFinanceRules({ groupId: "", scheduleIds: [id] })).toEqual({ moved: [], error: "schedules.moveRetry" });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("manage_finance_recurring_group", { p_studio_id: "verified", p_operation: "assign", p_id: undefined, p_schedule_id: id });
});
