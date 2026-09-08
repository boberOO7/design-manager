import { redirect } from "next/navigation";
import { CrmShell } from "@/components/crm/crm-shell";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const membership = await getActiveStudioMembership();
  if (!membership || membership.system_role !== "admin") redirect("/dashboard");
  return <CrmShell>{children}</CrmShell>;
}
