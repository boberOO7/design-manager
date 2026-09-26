import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: async () => ({ studio_id: "verified" }) }));
vi.mock("@/lib/validation/project", () => ({ getKyivDateOnly: () => "2026-09-20" }));
import { getFinanceSchedules } from "./finance";
it("uses maintained open payment dates, excluding cancelled, paid and past items", async () => {
  const queries: URL[] = [];
  const expected = (id: string, due_date: string, expected_payment_date: string | null, remaining_amount = 50, commitment = "agreed") => ({ expected: { id, due_date, expected_payment_date, remaining_amount, commitment } });
  mocks.client.mockResolvedValue(createClient<Database>("http://127.0.0.1:54321", "test-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); queries.push(url);
    return new Response(JSON.stringify(url.pathname.endsWith("/finance_schedules") ? [{ id: "rule" }, { id: "empty" }, { id: "removed", kind: "payroll", stopped_from: "2026-09-01" }] : url.pathname.endsWith("/finance_schedule_history") ? [{ schedule_id: "rule", obligations: [{ items: [
      expected("cancelled", "2026-09-20", null, 50, "cancelled"), expected("paid", "2026-09-21", null, 0),
      expected("rescheduled-past", "2026-10-01", "2026-09-19"), expected("later", "2026-10-05", null),
      expected("next", "2026-09-01", "2026-10-02"),
    ] }] }, { schedule_id: "removed", effective_from: "2026-09-01", obligations: [] }] : []), { headers: { "Content-Type": "application/json" } });
  } } }));
  const data = await getFinanceSchedules();
  expect(data?.schedules.map((rule) => rule.nextPayment)).toEqual([{ id: "next", date: "2026-10-02" }, null]);
  expect(data?.schedules.map((rule) => rule.id)).toEqual(["rule", "empty"]);
  expect(queries[0].pathname).toContain("ensure_finance_schedule_occurrences");
  for (const url of queries.slice(1)) {
    if (url.pathname.endsWith("/get_finance_payroll_editability")) expect(url.searchParams.get("studio_id")).toBeNull();
    else expect(url.searchParams.get("studio_id")).toBe("eq.verified");
  }
});
