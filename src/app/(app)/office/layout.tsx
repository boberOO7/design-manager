import { OfficeShell } from "@/components/office/office-shell";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { DomainMessages } from "@/i18n/domain-messages";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const membership = await getActiveStudioMembership();
  if (!membership) throw new Error("An active studio membership is required to load Office.");
  return <DomainMessages scope="office"><OfficeShell isAdmin={membership.system_role === "admin"}>{children}</OfficeShell></DomainMessages>;
}
