import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFinanceData } from "@/data/queries/finance";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { getKyivDateOnly } from "@/lib/validation/project";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Finance");
  return { title: t("title") };
}

export default async function FinancePage() {
  const data = await getFinanceData();
  if (!data) redirect("/dashboard");
  return <FinanceWorkspace {...data} today={getKyivDateOnly()} />;
}
