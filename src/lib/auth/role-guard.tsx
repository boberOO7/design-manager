import type { Profile } from "@/types";
import type { ReactNode } from "react";

/**
 * RoleGuard component for role-based access control.
 * 
 * Uses explicit API with profile passed as prop.
 * 
 * @example
 * <RoleGuard user={profile} allow={["admin"]}>
 *   ...admin-only content
 * </RoleGuard>
 */
export function RoleGuard({
  children,
  user,
  allow,
}: {
  children: ReactNode;
  user: Profile | null;
  allow: string[];
}) {
  if (!user) {
    return null;
  }

  const hasAccess = allow.some((role) => user.system_role === role);

  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
}
