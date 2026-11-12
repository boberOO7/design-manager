import { redirect } from "next/navigation";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { DomainMessages } from "@/i18n/domain-messages";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const membership = await getActiveStudioMembership();
  if (!membership || membership.system_role !== "admin") redirect("/dashboard");
  return <DomainMessages scope="crm">{children}</DomainMessages>;
}
