import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getLocale, getTranslations } from "next-intl/server";
import { getFinanceTrips } from "@/data/queries/finance-trips";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { sumTripMoney } from "@/lib/finance-trips";

export async function ProjectTripsSection({ projectId, currency }: { projectId: string; currency: FinanceCurrency }) {
  const [trips, t, locale] = await Promise.all([getFinanceTrips(projectId), getTranslations("Finance.trips"), getLocale()]);
  if (!trips) return null;
  const total = sumTripMoney(trips.map(v => v.actual_amount ?? "0"), currency.minor_units);
  return <section className="mt-3 inline-flex max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2.5 text-sm">
    <h2 className="font-semibold">{t("title")}</h2>
    <span className="text-xs text-[var(--ui-text-muted)]">{t("projectCount", { count: trips.length })}</span>
    <span className="text-xs text-[var(--ui-text-muted)]">{t("projectTotal")} <strong className="ui-numeric ml-1 font-semibold text-[var(--ui-text)]">{formatFinanceAmount(total, currency, locale)}</strong></span>
    <Button asChild size="sm" variant="outline"><Link href={`/finance/trips?project=${projectId}`}>{t("openTrips")}</Link></Button>
  </section>;
}
