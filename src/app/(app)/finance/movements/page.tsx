import { redirect } from "next/navigation";
import { getFinanceData, getFinanceMovements,getFinanceExpectedItem,getFinanceExpectedReturnHref } from "@/data/queries/finance";
import { z } from "zod";
import { FinanceMovementsWorkspace } from "@/components/finance/movements-workspace";
import { getKyivDateOnly } from "@/lib/validation/project";

export default async function FinanceMovementsPage({ searchParams }: { searchParams: Promise<{ page?: string; expected?:string; history?:string }> }) {
  const params=await searchParams;
  const requested = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requested) && requested>0 ? Math.min(requested,100_000) : 1;
  const history = params.history === "1";
  const [foundation, ledger] = await Promise.all([getFinanceData(), getFinanceMovements(page, history)]);
  if (!foundation || !ledger) redirect("/dashboard");
  const expected=params.expected&&z.uuid().safeParse(params.expected).success ? await getFinanceExpectedItem(params.expected) : null;
  if(params.expected&&(!expected||expected.commitment==="cancelled"||!expected.remaining_amount)) redirect("/finance/expected");
  const returnHref=expected?.id?await getFinanceExpectedReturnHref(expected.id):"/finance/expected";
  return <FinanceMovementsWorkspace {...foundation} {...ledger} expected={expected} returnHref={returnHref} history={history} page={page} today={getKyivDateOnly()} />;
}
