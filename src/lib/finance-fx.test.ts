import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const render = vi.hoisted(() => ({ values: new Map<() => unknown, unknown>() }));
// Model React's request cache; ordinary Node calls have no RSC dispatcher.
vi.mock("react", () => ({ cache: (fn: () => unknown) => () => {
  if (!render.values.has(fn)) render.values.set(fn, fn());
  return render.values.get(fn);
} }));
import { parseNbuRate, resolveFinanceFx, resolveFinanceFxDates } from "./finance-fx";
import { resolveForecastAssumptions } from "@/data/queries/finance-report-fx";

describe("historical Finance FX", () => {
  beforeEach(() => render.values.clear());
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
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("derives NBU cross-rates through UAH for two foreign currencies", async () => {
    const fetcher = vi.fn((input: URL) => Promise.resolve(new Response(JSON.stringify([{
      cc: input.searchParams.get("valcode")?.toUpperCase(), exchangedate: "05.09.2026",
      rate_per_unit: input.searchParams.get("valcode") === "eur" ? 45 : 40,
    }]))));
    vi.stubGlobal("fetch", fetcher);
    expect(await resolveFinanceFx("EUR", "USD", "2026-09-05", "nbu", "")).toEqual({ rate: "1.125", source: "nbu", effectiveDate: "2026-09-05" });
    expect(await resolveFinanceFx("UAH", "USD", "2026-09-05", "nbu", "")).toMatchObject({ rate: "0.025" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails closed for outages and mismatched dates instead of substituting a rate", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("unavailable",{ status: 503 })));
    await expect(resolveFinanceFx("USD","UAH","2026-09-05","nbu","")).rejects.toThrow();
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify([{ cc:"USD",exchangedate:"04.09.2026",rate_per_unit:42 }]))));
    await expect(resolveFinanceFx("USD","UAH","2026-09-05","nbu","")).rejects.toThrow();
  });
  it("shares in-flight dated rates between valuation, historical display and cross-rates", async () => {
    const fetcher = vi.fn(async (input: URL) => new Response(JSON.stringify([4, 5].map(day => ({
      cc: input.searchParams.get("valcode")?.toUpperCase(), exchangedate: `0${day}.09.2026`,
      rate_per_unit: input.searchParams.get("valcode") === "eur" ? 45 : day === 4 ? 40 : 42,
    })))));
    vi.stubGlobal("fetch", fetcher);
    const [historical, current, cross] = await Promise.all([
      resolveFinanceFxDates("UAH", "USD", ["2026-09-04", "2026-09-05", "2026-09-04"]),
      resolveFinanceFx("USD", "UAH", "2026-09-05", "nbu", ""),
      resolveFinanceFx("EUR", "USD", "2026-09-05", "nbu", ""),
    ]);
    expect(historical).toEqual(new Map([["2026-09-04", "0.025"], ["2026-09-05", "0.0238095238"]]));
    expect(current.rate).toBe("42");
    expect(cross.rate).toBe("1.0714285714");
    expect(fetcher).toHaveBeenCalledTimes(2);
    await resolveFinanceFxDates("UAH", "USD", ["2026-09-05"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await resolveFinanceFxDates("UAH", "USD", [])).toEqual(new Map());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not carry rates into the next render or change an explicit manual rate", async () => {
    const fetcher = vi.fn().mockImplementation(() => Response.json([{ cc: "USD", exchangedate: "05.09.2026", rate_per_unit: fetcher.mock.calls.length === 1 ? 40 : 42 }]));
    vi.stubGlobal("fetch", fetcher);
    expect((await resolveFinanceFx("USD", "UAH", "2026-09-05", "nbu", "")).rate).toBe("40");
    expect((await resolveFinanceFx("USD", "UAH", "2026-09-05", "manual", "39")).rate).toBe("39");
    render.values.clear();
    expect((await resolveFinanceFx("USD", "UAH", "2026-09-05", "nbu", "")).rate).toBe("42");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])("shares forecast and inverse display keys while preserving historical rates and manual overrides: %s", async manual => {
    const fetcher = vi.fn(async (input: URL) => Response.json([4, 5].map(day => ({
      cc: input.searchParams.get("valcode")?.toUpperCase(), exchangedate: `0${day}.09.2026`, rate_per_unit: day === 4 ? 50 : 40,
    }))));
    vi.stubGlobal("fetch", fetcher);
    const forecast = await resolveForecastAssumptions({ asOf: "2026-09-05", currency: "UAH", items: [], issues: [] },
      manual ? [{ currency: "EUR", rate: "39", source: "manual", effectiveDate: "2026-09-05" }] : [],
      ["EUR", "PLN", "USD", "USD"]);
    expect(forecast.find(row => row.currency === "EUR")).toMatchObject({ rate: manual ? "39" : "40", source: manual ? "manual" : "nbu" });
    const [current, historical] = await Promise.all([
      resolveFinanceFx("UAH", "USD", "2026-09-05", "nbu", ""),
      resolveFinanceFxDates("UAH", "USD", ["2026-09-04", "2026-09-05"]),
    ]);
    expect(current.rate).toBe("0.025");
    expect(historical).toEqual(new Map([["2026-09-04", "0.02"], ["2026-09-05", "0.025"]]));
    expect(fetcher.mock.calls.map(([url]) => [url.searchParams.get("valcode"), url.searchParams.get("start"), url.searchParams.get("end")])).toEqual([
      ...(!manual ? [["eur", "20260905", "20260905"]] : []),
      ["pln", "20260905", "20260905"], ["usd", "20260905", "20260905"],
      ["usd", "20260904", "20260904"],
    ]);
  });
  it("keeps year/date boundaries and retries failed dates without inventing historical rates", async () => {
    const fetcher = vi.fn(async (input: URL) => Response.json([{
      cc: "USD", exchangedate: input.searchParams.get("start") === "20251231" ? "31.12.2025" : "01.01.2026", rate_per_unit: 40,
    }]));
    vi.stubGlobal("fetch", fetcher);
    expect(await resolveFinanceFxDates("USD", "UAH", ["2025-12-31", "2026-01-01"])).toEqual(new Map([["2025-12-31", "40"], ["2026-01-01", "40"]]));
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(resolveFinanceFxDates("USD", "UAH", ["2026-01-02"])).rejects.toThrow();
    fetcher.mockImplementationOnce(async () => Response.json([{ cc: "USD", exchangedate: "02.01.2026", rate_per_unit: 41 }]));
    expect(await resolveFinanceFxDates("USD", "UAH", ["2026-01-02"])).toEqual(new Map([["2026-01-02", "41"]]));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
