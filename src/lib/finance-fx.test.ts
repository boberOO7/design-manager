import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseNbuRate, resolveFinanceFx } from "./finance-fx";

describe("historical Finance FX", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses the effective date and per-unit value, never calculation date or raw units", () => {
    expect(parseNbuRate([{ cc: "JPY", exchangedate: "05.09.2026", calcdate: "04.09.2026", rate: 280, units: 100, rate_per_unit: 2.8 }],"JPY","2026-09-05")).toBe("2.8");
    for (const payload of [[], [{ cc: "USD", exchangedate: "06.09.2026", rate_per_unit: 42 }], [{ cc: "EUR", exchangedate: "05.09.2026", rate_per_unit: 42 }], [{ cc: "USD", exchangedate: "05.09.2026", rate_per_unit: 0 }]]) expect(() => parseNbuRate(payload,"USD","2026-09-05")).toThrow();
  });
  it("makes a bounded dated request and preserves source metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ cc: "USD", exchangedate: "05.09.2026", rate_per_unit: 42.12 }])));
    vi.stubGlobal("fetch",fetcher);
    expect(await resolveFinanceFx("USD","UAH","2026-09-05","nbu","")).toEqual({ rate: "42.12", source: "nbu", effectiveDate: "2026-09-05" });
    const url: URL = fetcher.mock.calls[0][0];
    expect(url.searchParams.get("start")).toBe("20260905");
    expect(url.searchParams.get("end")).toBe("20260905");
    expect(url.searchParams.get("valcode")).toBe("usd");
  });
  it("does not call a provider for identity or explicit manual valuations", async () => {
    const fetcher=vi.fn(); vi.stubGlobal("fetch",fetcher);
    expect(await resolveFinanceFx("EUR","EUR","2026-09-05","nbu","")).toMatchObject({ rate: "1", source: "identity" });
    expect(await resolveFinanceFx("USD","EUR","2026-09-05","manual","0.91")).toMatchObject({ rate: "0.91", source: "manual" });
    await expect(resolveFinanceFx("USD","EUR","2026-09-05","nbu","")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed for outages and mismatched dates instead of substituting a rate", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("unavailable",{ status: 503 })));
    await expect(resolveFinanceFx("USD","UAH","2026-09-05","nbu","")).rejects.toThrow();
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify([{ cc:"USD",exchangedate:"04.09.2026",rate_per_unit:42 }]))));
    await expect(resolveFinanceFx("USD","UAH","2026-09-05","nbu","")).rejects.toThrow();
  });
});
