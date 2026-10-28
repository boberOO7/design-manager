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
    return new Response(JSON.stringify(url.pathname.endsWith("/get_finance_expense_automation_reporting") ? { projects: [], policies: [], periods: [], candidates: [], missingFx: [] } : url.pathname.endsWith("/finance_schedules") ? [{ id: "rule" }, { id: "empty" }, { id: "removed", kind: "payroll", stopped_from: "2026-09-01" }] : url.pathname.endsWith("/finance_schedule_history") ? [{ schedule_id: "rule", obligations: [{ items: [
      expected("cancelled", "2026-09-20", null, 50, "cancelled"), expected("paid", "2026-09-21", null, 0),
      expected("rescheduled-past", "2026-10-01", "2026-09-19"), expected("later", "2026-10-05", null),
      expected("next", "2026-09-01", "2026-10-02"),
    ] }] }, { schedule_id: "removed", effective_from: "2026-09-01", obligations: [] }] : []), { headers: { "Content-Type": "application/json" } });
  } } }));
  const data = await getFinanceSchedules();
  expect(data?.schedules.map((rule) => rule.nextPayment)).toEqual([{ id: "next", date: "2026-10-02" }, null]);
  expect(data?.schedules.map((rule) => rule.id)).toEqual(["rule", "empty"]);
  expect(data?.payrollPeriods).toEqual([]);
  const payrollQuery = queries.filter(url => url.pathname.endsWith("/finance_obligations"));
  expect(payrollQuery).toHaveLength(1);
  expect(payrollQuery[0].searchParams.get("kind")).toBe("eq.payroll");
  expect(payrollQuery[0].searchParams.get("period_start")).toBe("lte.2026-09-20");
  expect(queries.some(url => url.pathname.includes("ensure_finance_schedule_occurrences"))).toBe(false);
  for (const url of queries) {
    if (url.pathname.endsWith("/get_finance_payroll_editability") || url.pathname.endsWith("/get_finance_payroll_historical_terms") || url.pathname.endsWith("/get_finance_expense_automation_reporting")) expect(url.searchParams.get("studio_id")).toBeNull();
    else expect(url.searchParams.get("studio_id")).toBe("eq.verified");
  }
});

it("loads payroll months for the whole studio without truncating older periods", async () => {
  const queries: URL[] = [];
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `period-${index}`, schedule_id: index % 2 ? "salary-a" : "salary-b", period_start: "2026-09-01" }));
  mocks.client.mockResolvedValue(createClient<Database>("http://127.0.0.1:54321", "test-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    queries.push(url);
    const data = url.pathname.endsWith("/get_finance_expense_automation_reporting")
      ? { projects: [], policies: [], periods: [], candidates: [], missingFx: [] }
      : url.pathname.endsWith("/finance_obligations") ? rows.slice(Number(url.searchParams.get("offset") ?? 0), Number(url.searchParams.get("offset") ?? 0) + 1000) : [];
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  } } }));
  expect((await getFinanceSchedules())?.payrollPeriods).toEqual(rows);
  const pages = queries.filter(url => url.pathname.endsWith("/finance_obligations"));
  expect(pages).toHaveLength(2);
  expect(pages.map(url => url.searchParams.get("offset"))).toEqual(["0", "1000"]);
  for (const page of pages) {
    expect(page.searchParams.get("studio_id")).toBe("eq.verified");
    expect(page.searchParams.get("schedule_id")).toBeNull();
    expect(page.searchParams.get("order")).toBe("period_start.desc,id.asc");
  }
});
