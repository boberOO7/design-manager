import { redirect } from "next/navigation";
import { z } from "zod";
import { getFinanceData } from "@/data/queries/finance";
import { getFinanceTrips, getFinanceTripOptions } from "@/data/queries/finance-trips";
import { FinanceTripsWorkspace } from "@/components/finance/trips-workspace";
import { parseFinanceReportParams } from "@/lib/finance-overview";
import { getKyivDateOnly } from "@/lib/validation/project";

export default async function TripsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const params = await searchParams;
  const {fx} = parseFinanceReportParams(params,getKyivDateOnly());
  const projectId = z.uuid().optional().catch(undefined).parse(params.project);
  const [foundation, trips, options] = await Promise.all([getFinanceData(), getFinanceTrips(projectId,fx), getFinanceTripOptions()]);
  if (!foundation || !trips || !options) redirect("/dashboard");
  const calendarId = z.uuid().safeParse(params.calendar);
  const linked = calendarId.success ? trips.find(trip=>trip.calendar_source_id===calendarId.data) : null;
  if (linked) redirect(`/finance/trips/${linked.id}`);
  return <FinanceTripsWorkspace foundation={foundation} trips={trips} options={options} today={getKyivDateOnly()} projectId={projectId}/>;
}
