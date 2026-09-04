import { OfficeShell } from "@/components/office/office-shell";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const membership = await getActiveStudioMembership();
  if (!membership) throw new Error("An active studio membership is required to load Office.");
  return <OfficeShell isAdmin={membership.system_role === "admin"}>{children}</OfficeShell>;
}
