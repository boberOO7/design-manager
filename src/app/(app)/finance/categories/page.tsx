import { redirect } from "next/navigation";
import { getFinanceData } from "@/data/queries/finance";
import { FinanceCategoriesWorkspace } from "@/components/finance/categories-workspace";
export default async function FinanceCategoriesPage() {
  const data=await getFinanceData();
  if(!data) redirect("/dashboard");
  return <FinanceCategoriesWorkspace categories={data.categories} ready={Boolean(data.settings)}/>;
}
