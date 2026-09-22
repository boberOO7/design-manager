import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getFinanceTrips } from "@/data/queries/finance-trips";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { sumTripMoney } from "@/lib/finance-trips";

export async function ProjectTripsSection({ projectId, currency }: { projectId: string; currency: FinanceCurrency }) {
  const [trips, t, locale] = await Promise.all([getFinanceTrips(projectId), getTranslations("Finance.trips"), getLocale()]);
  if (!trips) return null;
  const total = sumTripMoney(trips.map(v => v.actual_amount ?? "0"), currency.minor_units);
  return <section className="mt-6 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t("title")}</h2><Link className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" href={`/finance/trips?project=${projectId}`}>{t("openTrips")}</Link></div>
    {trips.length ? <><p className="mt-2 text-sm text-[var(--ui-text-secondary)]">{t("projectTotal")} <strong className="ml-2 tabular-nums text-[var(--ui-text)]">{formatFinanceAmount(total, currency, locale)}</strong></p><ul className="mt-3 divide-y divide-[var(--ui-border)]">{trips.map(v => <li key={v.id}><Link className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm hover:underline" href={`/finance/trips/${v.id}`}><span>{v.title}</span><span className="tabular-nums">{formatFinanceAmount(v.actual_amount ?? "0", currency, locale)}</span></Link></li>)}</ul></> : <p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("empty")}</p>}
  </section>;
}
