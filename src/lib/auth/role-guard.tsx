import { getCurrentUserProfile } from "@/data/queries";
import type { ReactNode } from "react";

export function RoleGuard({
  children,
  allowAdmin = false,
}: {
  children: ReactNode;
  allowAdmin?: boolean;
}) {
  const user = getCurrentUserProfile();
  if (allowAdmin && user.system_role !== "admin") {
    return null;
  }
  return <>{children}</>;
}
