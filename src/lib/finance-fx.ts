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

export async function resolveFinanceFx(currency: string, reportingCurrency: string, date: string, mode: "nbu" | "manual", manualRate: string) {
  if (currency === reportingCurrency) return { rate: "1", source: "identity", effectiveDate: date };
  if (mode === "manual") return { rate: financeRateSchema.parse(manualRate), source: "manual", effectiveDate: date };
  if (reportingCurrency !== "UAH") throw new Error("finance_fx_unavailable");
  const day = z.iso.date().parse(date).replaceAll("-", "");
  const code = z.string().regex(/^[A-Z]{3}$/).parse(currency);
  const url = new URL("https://bank.gov.ua/NBU_Exchange/exchange_site");
  url.search = new URLSearchParams({ start: day, end: day, valcode: code.toLowerCase(), sort: "exchangedate", order: "desc", json: "" }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("finance_fx_unavailable");
  const payload: unknown = await response.json();
  return { rate: parseNbuRate(payload, code, date), source: "nbu", effectiveDate: date };
}
