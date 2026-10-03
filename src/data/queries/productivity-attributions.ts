import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectLeaderboardAttributions, type ProductivityContributionAttribution } from "@/lib/productivity";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";

/** Shared credited-area input for administrator-only productivity views. */
export async function getCanonicalProductivityAttributions(studioId: string, options: {
  contributorId?: string;
  bounds?: { start: string; end: string };
} = {}): Promise<ProductivityContributionAttribution[]> {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO"
    || access.membership.system_role !== "admin"
    || access.membership.studio_id !== studioId) return [];

  const supabase = await createClient();
  const page = (offset: number) => {
    let query = supabase.from("productivity_attributions")
      .select("id, project_id, task_id, contributor_id, contributor_name, contributor_job_title, credited_area_m2, source_type, task_stage, completed_at", { count: "exact" })
      .eq("studio_id", studioId).is("voided_at", null);
    if (options.contributorId) query = query.eq("contributor_id", options.contributorId);
    if (options.bounds) query = query.gte("completed_at", options.bounds.start).lt("completed_at", options.bounds.end);
    return query.order("completed_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + 999)
      .overrideTypes<ProductivityContributionAttribution[], { merge: false }>();
  };
  const { data, count, error } = await page(0);
  if (error || !data || count === null) throw new Error("Unable to load productivity.", { cause: error });
  const attributions = [...data];
  while (attributions.length < count) {
    const next = await page(attributions.length);
    if (next.error || !next.data?.length) throw new Error("Unable to load productivity.", { cause: next.error });
    attributions.push(...next.data);
  }

  // Only accounting flags use privileged access. Project/task context uses viewer RLS.
  const projectIds = [...new Set(attributions.map((attribution) => attribution.project_id))];
  const excludedProjectIds = new Set<string>();
  if (projectIds.length) {
    const admin = createAdminClient();
    for (let index = 0; index < projectIds.length; index += 100) {
      const result = await admin.from("projects").select("id, include_in_productivity")
        .eq("studio_id", studioId).in("id", projectIds.slice(index, index + 100));
      if (result.error || !result.data) throw new Error("Unable to load productivity.", { cause: result.error });
      for (const project of result.data) if (!project.include_in_productivity) excludedProjectIds.add(project.id);
    }
  }
  return selectLeaderboardAttributions(attributions, excludedProjectIds);
}
