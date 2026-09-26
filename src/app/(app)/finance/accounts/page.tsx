import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFinanceData } from "@/data/queries/finance";
import { createClient } from "@/lib/supabase/server";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { getKyivDateOnly } from "@/lib/validation/project";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Finance");
  return { title: t("title") };
}

export default async function FinancePage() {
  const data = await getFinanceData();
  if (!data) redirect("/dashboard");
  const canReopen = data.settings?.finalized_at
    ? await (await createClient()).rpc("can_reopen_finance_setup", { p_studio_id: data.settings.studio_id })
    : null;
  if (canReopen?.error) throw new Error("Unable to check Finance setup.", { cause: canReopen.error });
  return <FinanceWorkspace {...data} canReopen={canReopen?.data ?? false} today={getKyivDateOnly()} />;
}
