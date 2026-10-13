import "server-only";
import { cache } from "react";
import { z } from "zod";
import { financeRateSchema } from "./finance-movements";

const nbuRows = z.array(z.object({ cc: z.string(), exchangedate: z.string(), rate_per_unit: z.number().finite().positive() }));

// React cache scopes this map to the server render, never to another user/request.
const getRequestRates = cache(() => new Map<string, Promise<string>>());

// NBU's range endpoint returns effective dates and rates per one unit, including weekends.
// https://bank.gov.ua/admin_uploads/article/Instr_API_KURS_VAL_data_Full_eng.pdf
export function parseNbuRate(payload: unknown, currency: string, date: string) {
  const wanted = date.split("-").reverse().join(".");
  const matches = nbuRows.parse(payload).filter((row) => row.cc === currency && row.exchangedate === wanted);
  if (matches.length !== 1) throw new Error("finance_fx_unavailable");
  return financeRateSchema.parse(String(matches[0].rate_per_unit));
}

async function nbuUahRates(currency: string, dates: string[]) {
  if (currency === "UAH") return new Map(dates.map(date => [date, "1"]));
  const code = z.string().regex(/^[A-Z]{3}$/).parse(currency);
  const rates = getRequestRates();
  const byYear = new Map<string, string[]>();
  for (const date of new Set(dates)) {
    z.iso.date().parse(date);
    if (rates.has(`${code}:${date}`)) continue;
    byYear.set(date.slice(0, 4), [...(byYear.get(date.slice(0, 4)) ?? []), date]);
  }
  for (const days of byYear.values()) {
    const first = days.reduce((a, b) => a < b ? a : b);
    const last = days.reduce((a, b) => a > b ? a : b);
    const url = new URL("https://bank.gov.ua/NBU_Exchange/exchange_site");
    url.search = new URLSearchParams({ start: first.replaceAll("-", ""), end: last.replaceAll("-", ""), valcode: code.toLowerCase(), sort: "exchangedate", order: "desc", json: "" }).toString();
    const payload = (async (): Promise<unknown> => {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("finance_fx_unavailable");
      return response.json();
    })();
    for (const date of days) {
      const key = `${code}:${date}`;
      const rate = payload.then(data => parseNbuRate(data, code, date));
      rates.set(key, rate);
      // Outages/missing dates remain retryable; never retain a failed or substitute rate.
      void rate.catch(() => { if (rates.get(key) === rate) rates.delete(key); });
    }
  }
  return new Map(await Promise.all([...new Set(dates)].map(async date => {
    const rate = await rates.get(`${code}:${date}`);
    if (!rate) throw new Error("finance_fx_unavailable");
    return [date, rate] as const;
  })));
}

function crossRate(fromUah: string, toUah: string, reportingCurrency: string) {
  return reportingCurrency === "UAH" ? fromUah : financeRateSchema.parse((Number(fromUah) / Number(toUah)).toFixed(10).replace(/0+$/, "").replace(/\.$/, ""));
}

async function resolveNbuFxDates(currency: string, reportingCurrency: string, dates: string[]) {
  const unique = [...new Set(dates)];
  if (currency === reportingCurrency) return new Map(unique.map(date => [date, "1"]));
  const [fromRates, toRates] = await Promise.all([nbuUahRates(currency, unique), nbuUahRates(reportingCurrency, unique)]);
  return new Map(unique.map(date => {
    const from = fromRates.get(date), to = toRates.get(date);
    if (!from || !to) throw new Error("finance_fx_unavailable");
    const rate = crossRate(from, to, reportingCurrency);
    return [date, rate] as const;
  }));
}

// Reporting providers share the same dated, units-per-one contract. Manual rates
// and economic settlement rates remain explicit decisions in their own flows.
const reportingFxProviders = { nbu: resolveNbuFxDates };
export const defaultFinanceReportingSource: keyof typeof reportingFxProviders = "nbu";

export async function resolveFinanceFxDates(currency: string, reportingCurrency: string, dates: string[], source: keyof typeof reportingFxProviders = defaultFinanceReportingSource) {
  return reportingFxProviders[source](currency, reportingCurrency, dates);
}

export async function resolveFinanceFx(currency: string, reportingCurrency: string, date: string, mode: keyof typeof reportingFxProviders | "manual", manualRate: string) {
  if (currency === reportingCurrency) return { rate: "1", source: "identity", effectiveDate: date };
  if (mode === "manual") return { rate: financeRateSchema.parse(manualRate), source: "manual", effectiveDate: date };
  const rate = (await resolveFinanceFxDates(currency, reportingCurrency, [date], mode)).get(date);
  if (!rate) throw new Error("finance_fx_unavailable");
  return { rate, source: mode, effectiveDate: date };
}
