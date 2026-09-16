import { redirect } from "next/navigation";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { DomainMessages } from "@/i18n/domain-messages";
import { FinanceNavigation } from "@/components/finance/finance-navigation";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  if (!await getActiveStudioAdmin()) redirect("/dashboard");
  return <DomainMessages scope="finance"><FinanceNavigation />{children}</DomainMessages>;
}
