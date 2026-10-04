import { redirect } from "next/navigation";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { DomainMessages } from "@/i18n/domain-messages";

export default async function StatisticsLayout({ children }: { children: React.ReactNode }) {
  if (!await getActiveStudioAdmin()) redirect("/dashboard");
  return <DomainMessages scope="statistics">{children}</DomainMessages>;
}
