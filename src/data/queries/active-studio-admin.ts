import "server-only";

import {
  getActiveStudioMembership,
  type ActiveStudioMembership,
} from "@/data/queries/active-studio-membership";

export async function getActiveStudioAdmin(): Promise<ActiveStudioMembership | null> {
  try {
    const membership = await getActiveStudioMembership();
    if (!membership || membership.system_role !== "admin") {
      return null;
    }

    return membership;
  } catch (error) {
    console.error("Unable to verify active studio administrator", error);
    return null;
  }
}
