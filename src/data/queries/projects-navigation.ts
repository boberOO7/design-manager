import "server-only";
import { createHash } from "node:crypto";
import { resolveActiveStudioMembership } from "./active-studio-membership";
import { getAccessibleProjectListRows } from "./project-progress";

/** Validate the authorization scope before revealing a retained router payload. */
export async function getProjectsNavigationScope(): Promise<string | null> {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return null;
  const { data, error } = await getAccessibleProjectListRows();
  if (error || !data) throw new Error("Unable to verify Projects navigation access.");
  const membership = access.membership;
  return createHash("sha256").update(JSON.stringify([
    membership.authenticatedUserId, membership.studio_id, membership.system_role,
    membership.joined_at, data.map(project => project.id).sort(),
  ])).digest("hex");
}
