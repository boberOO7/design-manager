import { redirect } from "next/navigation";
import { getFinanceData, getFinanceSchedules } from "@/data/queries/finance";
import { FinanceSchedulesWorkspace } from "@/components/finance/schedules-workspace";
import { instantToDateOnly } from "@/lib/calendar";

export default async function FinanceSchedulesPage({ searchParams }: { searchParams: Promise<{ expense?: string }> }) {
  const { expense } = await searchParams;
  const [foundation, schedules] = await Promise.all([getFinanceData(), getFinanceSchedules()]);
  if (!foundation || !schedules) redirect("/dashboard");
  return <FinanceSchedulesWorkspace initialExpenseScheduleId={expense} {...foundation} {...schedules} today={instantToDateOnly(new Date().toISOString())} />;
}
