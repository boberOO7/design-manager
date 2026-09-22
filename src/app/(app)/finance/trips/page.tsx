import { redirect } from "next/navigation";
import { z } from "zod";
import { getFinanceData } from "@/data/queries/finance";
import { getFinanceTrips, getFinanceTripOptions } from "@/data/queries/finance-trips";
import { FinanceTripsWorkspace } from "@/components/finance/trips-workspace";
import { getKyivDateOnly } from "@/lib/validation/project";

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const projectId = z.uuid().optional().catch(undefined).parse((await searchParams).project);
  const [foundation, trips, options] = await Promise.all([getFinanceData(), getFinanceTrips(projectId), getFinanceTripOptions()]);
  if (!foundation || !trips || !options) redirect("/dashboard");
  return <FinanceTripsWorkspace foundation={foundation} trips={trips} options={options} today={getKyivDateOnly()} projectId={projectId}/>;
}
