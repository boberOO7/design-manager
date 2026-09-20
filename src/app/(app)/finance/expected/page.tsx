import { z } from "zod";
import { redirect } from "next/navigation";
import { getFinanceData,getFinancePlanning,type FinancePlanningPeriod } from "@/data/queries/finance";
import { FinanceExpectedWorkspace } from "@/components/finance/expected-workspace";
import { getKyivDateOnly } from "@/lib/validation/project";
export default async function FinanceExpectedPage({ searchParams }: { searchParams:Promise<{ page?:string; credits?:string; filter?:string; period?:string; item?:string }> }) {
  const params=await searchParams;
  const positivePage=(value?:string)=>Number.isSafeInteger(Number(value))&&Number(value)>0?Math.min(Number(value),100000):1;
  const page=positivePage(params.page),creditPage=positivePage(params.credits);
  const filter=["incoming","outgoing","receivables","obligations","cancelled"].includes(params.filter??"")?params.filter??"all":"all";
  const period:FinancePlanningPeriod=(['month','30days','3months','6months','all'] as const).find((value)=>value===params.period)??"all";
  const today=getKyivDateOnly();
  const itemId=z.uuid().optional().catch(undefined).parse(params.item);
  const [foundation,planning]=await Promise.all([getFinanceData(),getFinancePlanning(page,creditPage,filter,undefined,"design",period,today,itemId)]);
  if(!foundation||!planning) redirect("/dashboard");
  return <FinanceExpectedWorkspace {...foundation} {...planning} page={page} creditPage={creditPage} filter={filter} period={period} today={today} itemId={itemId}/>;
}
