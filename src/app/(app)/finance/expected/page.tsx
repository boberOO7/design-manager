import { redirect } from "next/navigation";
import { getFinanceData,getFinancePlanning } from "@/data/queries/finance";
import { FinanceExpectedWorkspace } from "@/components/finance/expected-workspace";
export default async function FinanceExpectedPage({ searchParams }: { searchParams:Promise<{ page?:string; credits?:string; filter?:string }> }) {
  const params=await searchParams;
  const positivePage=(value?:string)=>Number.isSafeInteger(Number(value))&&Number(value)>0?Math.min(Number(value),100000):1;
  const page=positivePage(params.page),creditPage=positivePage(params.credits);
  const filter=["incoming","outgoing","receivables","obligations","cancelled"].includes(params.filter??"")?params.filter??"all":"all";
  const [foundation,planning]=await Promise.all([getFinanceData(),getFinancePlanning(page,creditPage,filter)]);
  if(!foundation||!planning) redirect("/dashboard");
  return <FinanceExpectedWorkspace {...foundation} {...planning} page={page} creditPage={creditPage} filter={filter}/>;
}
