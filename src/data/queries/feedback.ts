import "server-only";
import { feedbackAnalyticsSchema } from "@/lib/feedback-analytics";
import { defaultFeedbackTemplate, feedbackTemplateSchema } from "@/lib/feedback-template";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";

export async function getProjectFeedback(projectId: string, page: number) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { invitations: [], hasNext: false };
  const client = await createClient();
  const { data, error } = await client.from("project_feedback").select("*,version:feedback_template_versions!inner(config,version)")
    .eq("studio_id", admin.studio_id).eq("project_id", projectId)
    .order("created_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20);
  if (error) throw new Error("Unable to load project feedback", { cause: error });
  return { invitations: (data ?? []).slice(0, 20), hasNext: (data?.length ?? 0) > 20 };
}

export async function getStudioFeedbackSummary() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return [];
  const client = await createClient();
  const { data, error } = await client.rpc("get_studio_feedback_summary", { p_studio_id: admin.studio_id });
  if (error) throw new Error("Unable to load feedback summary", { cause: error });
  return data ?? [];
}

export async function getFeedbackTemplate() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const { data, error } = await client.from("feedback_templates")
    .select("revision,published:feedback_template_versions!inner(config,version)").eq("studio_id", admin.studio_id).maybeSingle();
  if (error) throw new Error("Unable to load feedback template", { cause: error });
  return { template: data ? feedbackTemplateSchema.parse(data.published.config) : defaultFeedbackTemplate, revision: data?.revision ?? 0, version: data?.published.version ?? 1, studioName: admin.studioName };
}

export async function getFeedbackAnalytics(filters: { from?: string; to?: string; projectId?: string }) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [analytics, projects] = await Promise.all([
    client.rpc("get_feedback_analytics", { p_studio_id: admin.studio_id, p_from: filters.from, p_to: filters.to, p_project_id: filters.projectId }),
    client.from("projects").select("id,name").eq("studio_id", admin.studio_id).order("name"),
  ]);
  if (analytics.error || projects.error) throw new Error("Unable to load feedback analytics", { cause: analytics.error ?? projects.error });
  return { analytics: feedbackAnalyticsSchema.parse(analytics.data), projects: projects.data ?? [] };
}
