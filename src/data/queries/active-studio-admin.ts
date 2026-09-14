import "server-only";

import {
  resolveActiveStudioMembership,
  type ActiveStudioMembership,
} from "@/data/queries/active-studio-membership";

export async function getActiveStudioAdmin(): Promise<ActiveStudioMembership | null> {
  const resolution = await resolveActiveStudioMembership();
  if (resolution.status === "AUTH_ERROR") {
    throw new Error("Unable to verify the authenticated studio administrator.", { cause: resolution.cause });
  }
  if (resolution.status !== "ACTIVE_STUDIO" || resolution.membership.system_role !== "admin") {
    return null;
  }
  return resolution.membership;
}
