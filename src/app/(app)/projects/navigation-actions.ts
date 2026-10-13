"use server";

import { getProjectsNavigationScope } from "@/data/queries/projects-navigation";

// Read-only, including when a retained page checks access before its background refresh.
export async function verifyProjectsNavigationScope() {
  return getProjectsNavigationScope();
}
