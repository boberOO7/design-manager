import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { isProjectPriority, isProjectTypeKey, type ProjectTypeKey } from "@/lib/validation/project";
import { isProjectTemplateStage, type ProjectTemplate, type ProjectTemplateTask } from "@/lib/project-templates";

export async function getStudioProjectTemplates(): Promise<ProjectTemplate[]> {
  const membership = await getActiveStudioMembership();
  if (!membership) return [];
  const supabase = await createClient();
  const { data: templates, error: templateError } = await supabase.from("project_templates").select("id, name, project_type, is_active").eq("studio_id", membership.studio_id).order("name");
  if (templateError) throw new Error("Unable to load project templates.", { cause: templateError });
  const validTemplates = (templates ?? []).filter((template): template is typeof template & { project_type: ProjectTypeKey } => isProjectTypeKey(template.project_type));
  if (!validTemplates.length) return [];
  const { data: tasks, error: taskError } = await supabase.from("project_template_tasks").select("id, template_id, stage, title, priority, position").in("template_id", validTemplates.map((template) => template.id)).order("stage").order("position").order("id");
  if (taskError) throw new Error("Unable to load project template tasks.", { cause: taskError });
  const validTasks = (tasks ?? []).flatMap((task): Array<ProjectTemplateTask & { templateId: string }> => {
    if (!isProjectTemplateStage(task.stage) || !isProjectPriority(task.priority)) return [];
    return [{ id: task.id, templateId: task.template_id, stage: task.stage, title: task.title, priority: task.priority, position: task.position }];
  });
  return validTemplates.map((template) => ({
    id: template.id, name: template.name, projectType: template.project_type, isActive: template.is_active,
    tasks: validTasks.filter((task) => task.templateId === template.id).map((task) => ({
      id: task.id,
      stage: task.stage,
      title: task.title,
      priority: task.priority,
      position: task.position,
    })),
  }));
}
