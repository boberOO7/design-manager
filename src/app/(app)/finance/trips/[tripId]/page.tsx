import { notFound } from "next/navigation";
import { z } from "zod";
import { getFinanceData } from "@/data/queries/finance";
import { getFinanceTrip, getFinanceTripOptions } from "@/data/queries/finance-trips";
import { FinanceTripWorkspace } from "@/components/finance/trips-workspace";
import { getKyivDateOnly } from "@/lib/validation/project";

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const id = z.uuid().safeParse((await params).tripId);
  if (!id.success) notFound();
  const [foundation, data, options] = await Promise.all([getFinanceData(), getFinanceTrip(id.data), getFinanceTripOptions()]);
  if (!foundation || !data || !options) notFound();
  return <FinanceTripWorkspace foundation={foundation} data={data} options={options} today={getKyivDateOnly()}/>;
}
