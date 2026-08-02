import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";

export async function getStudioChecklistTemplates({ includeArchived = false }: { includeArchived?: boolean } = {}): Promise<StudioChecklistTemplate[]> {
  const membership = await getActiveStudioMembership();
  if (!membership) return [];
  const supabase = await createClient();
  let templateQuery = supabase.from("checklist_templates").select("id, name, archived_at").eq("studio_id", membership.studio_id).order("name");
  if (!includeArchived) templateQuery = templateQuery.is("archived_at", null);
  const { data: templates, error: templateError } = await templateQuery;
  if (templateError) throw new Error("Unable to load checklist templates.", { cause: templateError });
  const ids = (templates ?? []).map((template) => template.id);
  if (!ids.length) return [];
  const { data: stages, error: stageError } = await supabase.from("checklist_template_items").select("id, template_id, title, weight, position").in("template_id", ids).order("position").order("id");
  if (stageError) throw new Error("Unable to load checklist template stages.", { cause: stageError });
  return templates!.map((template) => ({
    id: template.id,
    name: template.name,
    archivedAt: template.archived_at,
    stages: (stages ?? []).filter((stage) => stage.template_id === template.id).map((stage) => ({ id: stage.id, title: stage.title, weight: stage.weight })),
  }));
}
