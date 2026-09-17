import { redirect } from "next/navigation";
import { getFinanceData, getFinanceSchedules } from "@/data/queries/finance";
import { FinanceSchedulesWorkspace } from "@/components/finance/schedules-workspace";
import { instantToDateOnly } from "@/lib/calendar";

export default async function FinanceSchedulesPage() {
  const [foundation, schedules] = await Promise.all([getFinanceData(), getFinanceSchedules()]);
  if (!foundation || !schedules) redirect("/dashboard");
  return <FinanceSchedulesWorkspace {...foundation} {...schedules} today={instantToDateOnly(new Date().toISOString())} />;
}
