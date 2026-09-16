import { redirect } from "next/navigation";
import { getFinanceData, getFinanceMovements } from "@/data/queries/finance";
import { FinanceMovementsWorkspace } from "@/components/finance/movements-workspace";
import { getKyivDateOnly } from "@/lib/validation/project";

export default async function FinanceMovementsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const requested = Number((await searchParams).page ?? 1);
  const page = Number.isSafeInteger(requested) && requested>0 ? Math.min(requested,100_000) : 1;
  const [foundation, ledger] = await Promise.all([getFinanceData(), getFinanceMovements(page)]);
  if (!foundation || !ledger) redirect("/dashboard");
  return <FinanceMovementsWorkspace {...foundation} {...ledger} page={page} today={getKyivDateOnly()} />;
}
