import "server-only";

import { getCurrentUserProfile } from "@/data/queries";
import {
  getActiveStudioMembership,
  type ActiveStudioMembership,
} from "@/data/queries/active-studio-membership";

export async function getActiveStudioAdmin(): Promise<ActiveStudioMembership | null> {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile || !profile.is_active || profile.system_role !== "admin") {
      return null;
    }

    const membership = await getActiveStudioMembership();
    if (
      !membership ||
      membership.authenticatedUserId !== profile.id ||
      membership.system_role !== "admin"
    ) {
      return null;
    }

    return membership;
  } catch (error) {
    console.error("Unable to verify active studio administrator", error);
    return null;
  }
}
