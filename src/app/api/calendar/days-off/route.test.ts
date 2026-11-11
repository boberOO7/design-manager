import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { POST, DELETE } from "./route";
import { PATCH } from "./[dayOffId]/route";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), client: vi.fn(), schedule: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-membership", () => ({ getActiveStudioMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/finance-automatic-labor", () => ({ scheduleAutomaticLabor: mocks.schedule }));
const id = "80100000-0000-4000-8000-000000000001";
const studioId = "80100000-0000-4000-8000-000000000002";
const userId = "80100000-0000-4000-8000-000000000003";
const request = (method: string, body: unknown) => new Request("http://localhost/api/calendar/days-off", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const period = { name: "Winter break", startDate: "2027-01-07", endDate: "2027-01-10" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ system_role: "admin", studio_id: studioId, authenticatedUserId: userId });
});
function client(fetch: (url: URL, init: RequestInit | undefined) => Promise<Response>) {
  mocks.client.mockResolvedValue(createClient<Database>("http://localhost:54321", "test-key", { auth: { persistSession: false }, global: {
    fetch: (input, init) => fetch(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init),
  } }));
}

describe("Company days off API", () => {
  it("rejects non-admins before creating a database client", async () => {
    mocks.membership.mockResolvedValue({ system_role: "employee" });
    expect((await POST(request("POST", period))).status).toBe(403);
    expect((await DELETE(request("DELETE", { ids: [id] }))).status).toBe(403);
    expect((await PATCH(request("PATCH", period), { params: Promise.resolve({ dayOffId: id }) })).status).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("inserts a whole period as exactly one authorized row and schedules one recalculation", async () => {
    client(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual([{ date: period.startDate, end_date: period.endDate, name: period.name, note: null, studio_id: studioId, created_by: userId }]);
      return json([{ id, date: period.startDate, end_date: period.endDate, name: period.name, note: null }]);
    });
    const response = await POST(request("POST", period));
    expect(response.status).toBe(201);
    expect((await response.json()).daysOff).toHaveLength(1);
    expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith(studioId);
  });
  it("sends separate dates in one atomic insert and preserves a database overlap failure", async () => {
    const calls: string[] = [];
    client(async (_url, init) => {
      calls.push(String(init?.method));
      expect(JSON.parse(String(init?.body))).toHaveLength(2);
      return json({ code: "23P01", message: "conflicting key" }, 409);
    });
    const response = await POST(request("POST", { name: period.name, dates: ["2027-01-07", "2027-01-10"] }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, code: "overlap" });
    expect(calls).toEqual(["POST"]);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("updates the same period identity and guards both record and studio", async () => {
    client(async (url, init) => {
      expect(url.searchParams.get("studio_id")).toBe(`eq.${studioId}`);
      expect(url.searchParams.get("id")).toBe(`eq.${id}`);
      expect(JSON.parse(String(init?.body))).toEqual({ date: period.startDate, end_date: period.endDate, name: period.name, note: null });
      return json({ id, date: period.startDate, end_date: period.endDate, name: period.name, note: null });
    });
    const response = await PATCH(request("PATCH", period), { params: Promise.resolve({ dayOffId: id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).daysOff[0].id).toBe(id);
  });
  it("deletes selected period records in one studio-scoped statement", async () => {
    client(async (url, init) => {
      expect(init?.method).toBe("DELETE");
      expect(url.searchParams.get("studio_id")).toBe(`eq.${studioId}`);
      expect(url.searchParams.get("id")).toContain(id);
      return json([{ id }]);
    });
    const response = await DELETE(request("DELETE", { ids: [id] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, ids: [id] });
    expect(mocks.schedule).toHaveBeenCalledOnce();
  });
  it("rejects invalid periods before any database write", async () => {
    expect((await POST(request("POST", { ...period, endDate: "2027-01-01" }))).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
});
