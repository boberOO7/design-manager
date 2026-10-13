import { StatisticsOverviewBlueprint } from "@/components/statistics/statistics-blueprint";
import { StatisticsShell } from "@/components/statistics/statistics-report";
import { statisticsRange } from "@/lib/statistics";
import { getKyivDateOnly } from "@/lib/validation/project";

export default function StatisticsLoading() {
  return <StatisticsShell period="12" section="overview" range={Promise.resolve(statisticsRange("12", getKyivDateOnly(), null))}>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><StatisticsOverviewBlueprint kind="production" /><StatisticsOverviewBlueprint kind="credits" /></div><StatisticsOverviewBlueprint kind="duration" />
  </StatisticsShell>;
}
