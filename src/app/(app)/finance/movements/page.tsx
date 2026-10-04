import { redirect } from "next/navigation";
import { getFinanceData, getFinanceMovements,getFinanceExpectedItem,getFinanceExpectedReturnHref } from "@/data/queries/finance";
import { z } from "zod";
import { FinanceMovementsWorkspace } from "@/components/finance/movements-workspace";
import { getFinanceSourceMovement } from "@/data/queries/finance-source-movement";
import { getKyivDateOnly } from "@/lib/validation/project";
import { getFinanceProjectCash } from "@/data/queries/finance-project-cash";

export default async function FinanceMovementsPage({ searchParams }: { searchParams: Promise<{ page?: string; expected?:string; history?:string; movement?:string }> }) {
  const params=await searchParams;
  const requested = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requested) && requested>0 ? Math.min(requested,100_000) : 1;
  const history = params.history === "1";
  const [foundation, ledger, projectCash] = await Promise.all([getFinanceData(), getFinanceMovements(page, history), getFinanceProjectCash()]);
  if (!foundation || !ledger) redirect("/dashboard");
  const expected=params.expected&&z.uuid().safeParse(params.expected).success ? await getFinanceExpectedItem(params.expected) : null;
  if(params.expected&&(!expected||expected.commitment==="cancelled"||!expected.remaining_amount)) redirect("/finance/expected");
  const movementId = params.movement && z.uuid().safeParse(params.movement).success ? params.movement : null;
  const sourceMovement = movementId ? await getFinanceSourceMovement(movementId) : null;
  const returnHref=expected?.id?await getFinanceExpectedReturnHref(expected.id):"/finance/expected";
  return <FinanceMovementsWorkspace {...foundation} {...ledger} projectCash={projectCash} expected={expected} returnHref={returnHref} history={history} page={page} today={getKyivDateOnly()} sourceMovement={sourceMovement} movementLinkUnavailable={Boolean(params.movement && !sourceMovement)} />;
}
