import { z } from "zod";
import { redirect } from "next/navigation";
import { getFinanceData,getFinancePlanning,type FinancePlanningPeriod } from "@/data/queries/finance";
import { FinanceExpectedWorkspace } from "@/components/finance/expected-workspace";
import { getKyivDateOnly } from "@/lib/validation/project";
import { parseFinanceExpectedStatus } from "@/lib/finance-planning";
import { resolveFinanceFx } from "@/lib/finance-fx";
export default async function FinanceExpectedPage({ searchParams }: { searchParams:Promise<{ page?:string; credits?:string; filter?:string; period?:string; item?:string; attention?:string; status?:string }> }) {
  const params=await searchParams;
  const positivePage=(value?:string)=>Number.isSafeInteger(Number(value))&&Number(value)>0?Math.min(Number(value),100000):1;
  const page=positivePage(params.page),creditPage=positivePage(params.credits);
  const filter=["incoming","outgoing","receivables","obligations"].includes(params.filter??"")?params.filter??"all":"all";
  const period:FinancePlanningPeriod=(['month','30days','3months','6months','all'] as const).find((value)=>value===params.period)??"all";
  const status=parseFinanceExpectedStatus(params.status,params.filter??"",params.attention);
  const attention=status==="overdue"?"overdue":undefined;
  const today=getKyivDateOnly();
  const itemId=z.uuid().optional().catch(undefined).parse(params.item);
  const [foundation,planning]=await Promise.all([getFinanceData(),getFinancePlanning(page,creditPage,filter,undefined,"design",period,today,itemId,attention,status)]);
  if(!foundation||!planning) redirect("/dashboard");
  const hasUsdPayroll = planning.obligations.some(link => link.obligation.kind === "payroll" && link.component === "payout" && planning.items.some(item => item.id === link.expected_item_id && item.currency === "USD" && item.commitment !== "cancelled" && (item.remaining_amount ?? 0) > 0));
  const payrollFx = hasUsdPayroll ? await resolveFinanceFx("USD", "UAH", today, "nbu", "").catch(() => null) : null;
  return <FinanceExpectedWorkspace {...foundation} {...planning} payrollUsdRate={payrollFx?.rate} page={page} creditPage={creditPage} filter={filter} period={period} today={today} itemId={itemId} attention={attention} status={status}/>;
}
