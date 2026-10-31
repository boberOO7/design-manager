import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getLocale, getTranslations } from "next-intl/server";
import { getFinanceTrips } from "@/data/queries/finance-trips";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { formatProjectFinanceMoney, type ProjectFinanceDisplay } from "@/lib/finance-project-view";
import { sumTripMoney } from "@/lib/finance-trips";

export async function ProjectTripsSection({ projectId, currency, display }: { projectId: string; currency: FinanceCurrency; display?: ProjectFinanceDisplay }) {
  const [trips, t, locale] = await Promise.all([getFinanceTrips(projectId), getTranslations("Finance.trips"), getLocale()]);
  if (!trips) return null;
  const total = sumTripMoney(trips.map(v => v.actual_amount ?? "0"), currency.minor_units);
  return <section className="flex w-full flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-4 text-sm sm:px-5">
    <div><h2 className="font-semibold">{t("title")}</h2><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("projectCount", { count: trips.length })}</p></div>
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div><p className="text-xs text-[var(--ui-text-secondary)]">{t("projectTotal")}</p><p className="ui-numeric mt-1 font-semibold">{formatProjectFinanceMoney(total, currency, display, locale)}{display && currency.code !== display.currency.code ? <span className="ml-2 text-xs font-normal text-[var(--ui-text-muted)]">{formatFinanceAmount(total, currency, locale)}</span> : null}</p></div>
      <Button asChild size="sm" variant="outline"><Link href={`/finance/trips?project=${projectId}`}>{t("openTrips")}</Link></Button>
    </div>
  </section>;
}
