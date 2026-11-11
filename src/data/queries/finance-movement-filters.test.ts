import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { FinanceMovementContext } from "./finance-movement-context";
import { emptyMovementFilters as defaults, movementPeriodBounds, parseMovementFilters, movementFiltersHref } from "@/lib/finance-movement-filters";
import { getFilteredMovementIds } from "./finance-movement-filters";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ contexts: vi.fn() }));
vi.mock("./finance-movement-context", () => ({ getFinanceMovementContexts: mocks.contexts }));

const studio = "10000000-0000-4000-8000-000000000001";
const category = "20000000-0000-4000-8000-000000000001";
const source = "30000000-0000-4000-8000-000000000001";
const destination = "30000000-0000-4000-8000-000000000002";
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({ id: id(n), studio_id: studio, kind: "incoming", category_id: category, category: "Archived label", description: `Payment ${n}`, financial_date: "2026-11-01", created_at: `2026-11-01T00:00:${String(n % 60).padStart(2, "0")}Z`, effective: true, entries: [{ account_id: source, currency: "USD", reporting_currency: "UAH" }] });
type Row = Omit<ReturnType<typeof row>, "category_id"> & { category_id: string | null };

// Execute requests through the real Supabase client; the transport fixture models parent-row
// pagination and EXISTS semantics, including a single matching transfer leg.
function fixture(rows: Row[]) {
  const requests: URL[] = [];
  const client = createClient<Database>("http://localhost:54321", "local-test-key", { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push(url);
    const p = url.searchParams;
    const eq = (key: string) => p.get(key)?.replace(/^eq\./, "");
    const dates = p.getAll("financial_date");
    const from = dates.find(value => value.startsWith("gte."))?.slice(4);
    const to = dates.find(value => value.startsWith("lte."))?.slice(4);
    const account = eq("matching_entries.account_id"), currency = eq("matching_entries.currency");
    const matches = rows.filter(item => item.studio_id === eq("studio_id")
      && (!url.pathname.endsWith("finance_current_movements") || item.effective)
      && (!eq("kind") || item.kind === eq("kind"))
      && (!eq("category_id") || (p.get("category_id") === "is.null" ? item.category_id === null : item.category_id === eq("category_id")))
      && (!from || item.financial_date >= from) && (!to || item.financial_date <= to)
      && (!(account || currency) || item.entries.some(entry => (!account || entry.account_id === account) && (!currency || entry.currency === currency))))
      .sort((a, b) => b.financial_date.localeCompare(a.financial_date) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    const offset = Number(p.get("offset") ?? 0), limit = Number(p.get("limit") ?? 50);
    return new Response(JSON.stringify(matches.slice(offset, offset + limit)), { headers: { "content-type": "application/json", "content-range": `${offset}-${Math.min(offset + limit, matches.length) - 1}/${matches.length}` } });
  } } });
  return { client, requests };
}
const presentation = { categories: [], locale: "uk", translate: (key: string) => key };
beforeEach(() => mocks.contexts.mockReset().mockResolvedValue(new Map<string, FinanceMovementContext[]>()));

describe("movement server filtering", () => {
  it("matches account and actual currency on the same transfer leg, with one parent result", async () => {
    const transfer = { ...row(1), kind: "transfer", entries: [row(1).entries[0], { account_id: destination, currency: "UAH", reporting_currency: "UAH" }, row(1).entries[0]] };
    const { client, requests } = fixture([transfer]);
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, account: source, currency: "UAH" })).toEqual({ ids: [], total: 0 });
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, account: source, currency: "USD" })).toEqual({ ids: [transfer.id], total: 1 });
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, account: destination, currency: "UAH", kind: "transfer" })).toEqual({ ids: [transfer.id], total: 1 });
    expect(requests[0].searchParams.get("select")).toContain("!inner()");
    expect(requests[0].searchParams.has("matching_entries.reporting_currency")).toBe(false);
  });
  it("combines category ID, account, cash currency and inclusive dates before counting/paging", async () => {
    const rows = Array.from({ length: 120 }, (_, n) => row(n));
    rows.push({ ...row(121), category_id: "other" }, { ...row(122), studio_id: "foreign" }, { ...row(123), financial_date: "2026-10-31" });
    const { client, requests } = fixture(rows);
    const result = await getFilteredMovementIds(client, studio, 2, { ...defaults, category, account: source, currency: "USD", period: "custom", from: "2026-11-01", to: "2026-11-01" });
    expect(result.total).toBe(120);
    expect(result.ids).toHaveLength(50);
    expect(requests[0].searchParams.get("offset")).toBe("50");
    expect(requests[0].searchParams.toString()).not.toContain("archived");
  });
  it("searches every candidate batch, then pages matches and retains the full match count", async () => {
    const rows = Array.from({ length: 145 }, (_, n) => ({ ...row(n), description: n < 20 ? "Unrelated" : "Needle payment" }));
    const { client, requests } = fixture(rows);
    const first = await getFilteredMovementIds(client, studio, 1, { ...defaults, q: "needle" }, presentation);
    const second = await getFilteredMovementIds(client, studio, 2, { ...defaults, q: "needle" }, presentation);
    const third = await getFilteredMovementIds(client, studio, 3, { ...defaults, q: "needle" }, presentation);
    expect(first.total).toBe(125);
    expect(first.ids).toHaveLength(50);
    expect(second.ids).toHaveLength(50);
    expect(third.ids).toHaveLength(25);
    expect(new Set([...first.ids, ...second.ids, ...third.ids]).size).toBe(125);
    expect(requests.some(request => request.searchParams.get("offset") === "100")).toBe(true);
    expect(mocks.contexts.mock.calls.every(call => call[2].length <= 50)).toBe(true);
  });
  it("finds payroll employees and localized source context outside the first display page", async () => {
    const rows = Array.from({ length: 101 }, (_, n) => row(n));
    rows[100].financial_date = "2026-10-01";
    const { client } = fixture(rows);
    const employee: FinanceMovementContext = { id: "salary", category_id: category, description: "Base salary · 2026-10", payroll: { component: "payout", obligation: { kind: "payroll", employee_name: "Олена Патер", period_start: "2026-10-01" } }, project: null };
    mocks.contexts.mockResolvedValue(new Map([[id(100), [employee]]]));
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, q: "патер ОЛЕНА", currency: "USD" }, presentation)).toEqual({ ids: [id(100)], total: 1 });
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, q: "патер", currency: "UAH" }, presentation)).toEqual({ ids: [], total: 0 });
  });
  it("keeps exact refund/owner/reversal types and includes cancelled records only on request", async () => {
    const { client } = fixture([{ ...row(1), kind: "refund" }, { ...row(2), kind: "owner_withdrawal" }, { ...row(3), kind: "reversal", effective: false }]);
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, kind: "refund" })).toEqual({ ids: [id(1)], total: 1 });
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, kind: "owner_withdrawal" })).toEqual({ ids: [id(2)], total: 1 });
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, kind: "reversal" })).toEqual({ ids: [], total: 0 });
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, kind: "reversal", history: true })).toEqual({ ids: [id(3)], total: 1 });
  });
  it("does not reinterpret an invalid custom period as all time", async () => {
    const { client, requests } = fixture([row(1)]);
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, period: "custom", from: "2026-11-12", to: "2026-11-01" })).toEqual({ ids: [], total: 0 });
    expect(requests).toHaveLength(0);
  });
  it("retains uncategorized history and does not require a matching entry without entry filters", async () => {
    const { client, requests } = fixture([{ ...row(1), category_id: null, entries: [] }, row(2)]);
    expect(await getFilteredMovementIds(client, studio, 1, { ...defaults, category: "none" })).toEqual({ ids: [id(1)], total: 1 });
    expect(requests[0].searchParams.get("select")).not.toContain("!inner");
  });
  it("propagates load failures instead of showing successful empty results", async () => {
    const client = createClient<Database>("http://localhost:54321", "local-test-key", { global: { fetch: async () => new Response(JSON.stringify({ code: "42501", message: "permission denied" }), { status: 403, headers: { "content-type": "application/json" } }) } });
    await expect(getFilteredMovementIds(client, studio, 1, defaults)).rejects.toThrow("Unable to filter Finance movements");
  });
});

describe("movement filter URLs and calendar periods", () => {
  it("handles year boundaries and leap months using date-only bounds", () => {
    expect(movementPeriodBounds({ ...defaults, period: "previous" }, "2026-01-15")).toEqual(["2025-12-01", "2025-12-31"]);
    expect(movementPeriodBounds({ ...defaults, period: "month" }, "2024-02-15")).toEqual(["2024-02-01", "2024-02-29"]);
  });
  it("round-trips filters including literal search punctuation and archived IDs", () => {
    const filters = { ...defaults, q: "Олена, 50% (оплата)", category, account: source, currency: "USD", history: true };
    const params = Object.fromEntries(new URL(movementFiltersHref(filters, 3), "http://localhost").searchParams);
    expect(parseMovementFilters(params)).toEqual(filters);
    expect(movementFiltersHref(filters)).not.toContain("page=");
  });
});
