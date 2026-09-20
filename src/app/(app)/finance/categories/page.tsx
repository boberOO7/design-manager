import { redirect } from "next/navigation";
import { getFinanceCategories } from "@/data/queries/finance";
import { FinanceCategoriesWorkspace } from "@/components/finance/categories-workspace";
export default async function FinanceCategoriesPage() {
  const data=await getFinanceCategories();
  if(!data) redirect("/dashboard");
  return <FinanceCategoriesWorkspace categories={data.categories} ready={data.ready}/>;
}
