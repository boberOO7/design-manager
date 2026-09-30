import "server-only";
import { z } from "zod";
import { financeRateSchema } from "./finance-movements";

const nbuRows = z.array(z.object({ cc: z.string(), exchangedate: z.string(), rate_per_unit: z.number().finite().positive() }));

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
  const byYear = new Map<string, string[]>();
  for (const date of dates) {
    z.iso.date().parse(date);
    byYear.set(date.slice(0, 4), [...(byYear.get(date.slice(0, 4)) ?? []), date]);
  }
  const groups = await Promise.all([...byYear.values()].map(async days => {
    const first = days.reduce((a, b) => a < b ? a : b);
    const last = days.reduce((a, b) => a > b ? a : b);
    const url = new URL("https://bank.gov.ua/NBU_Exchange/exchange_site");
    url.search = new URLSearchParams({ start: first.replaceAll("-", ""), end: last.replaceAll("-", ""), valcode: code.toLowerCase(), sort: "exchangedate", order: "desc", json: "" }).toString();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("finance_fx_unavailable");
    const payload: unknown = await response.json();
    return days.map(date => [date, parseNbuRate(payload, code, date)] as const);
  }));
  return new Map(groups.flat());
}

function crossRate(fromUah: string, toUah: string, reportingCurrency: string) {
  return reportingCurrency === "UAH" ? fromUah : financeRateSchema.parse((Number(fromUah) / Number(toUah)).toFixed(10).replace(/0+$/, "").replace(/\.$/, ""));
}

export async function resolveFinanceFxDates(currency: string, reportingCurrency: string, dates: string[]) {
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

async function nbuUahRate(currency: string, date: string) {
  const rate = (await nbuUahRates(currency, [date])).get(date);
  if (!rate) throw new Error("finance_fx_unavailable");
  return rate;
}

export async function resolveFinanceFx(currency: string, reportingCurrency: string, date: string, mode: "nbu" | "manual", manualRate: string) {
  if (currency === reportingCurrency) return { rate: "1", source: "identity", effectiveDate: date };
  if (mode === "manual") return { rate: financeRateSchema.parse(manualRate), source: "manual", effectiveDate: date };
  const [fromUah, toUah] = await Promise.all([nbuUahRate(currency, date), nbuUahRate(reportingCurrency, date)]);
  const rate = crossRate(fromUah, toUah, reportingCurrency);
  return { rate, source: "nbu", effectiveDate: date };
}
