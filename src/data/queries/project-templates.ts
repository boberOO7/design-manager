import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { isProjectPriority, isProjectTypeKey, type ProjectTypeKey } from "@/lib/validation/project";
import { isProjectTemplateStage, type ProjectTemplate, type ProjectTemplateTask } from "@/lib/project-templates";

export async function getStudioProjectTemplates(): Promise<ProjectTemplate[]> {
  const membership = await getActiveStudioMembership();
  if (!membership) return [];
  const supabase = await createClient();
  const { data: templates, error: templateError } = await supabase.from("project_templates").select("id, name, project_type, is_active, is_default").eq("studio_id", membership.studio_id).eq("is_active", true).order("name");
  if (templateError) throw new Error("Unable to load project templates.", { cause: templateError });
  const validTemplates = (templates ?? []).filter((template): template is typeof template & { project_type: ProjectTypeKey } => isProjectTypeKey(template.project_type));
  if (!validTemplates.length) return [];
  const { data: tasks, error: taskError } = await supabase.from("project_template_tasks").select("id, template_id, stage, title, priority, position, checklist_template_id, expected_workdays, depends_on_positions").in("template_id", validTemplates.map((template) => template.id)).order("stage").order("position").order("id");
  if (taskError) throw new Error("Unable to load project template tasks.", { cause: taskError });
  const validTasks = (tasks ?? []).flatMap((task): Array<Omit<ProjectTemplateTask, "dependsOnIds"> & { templateId: string; dependsOnPositions: number[] }> => {
    if (!isProjectTemplateStage(task.stage) || !isProjectPriority(task.priority)) return [];
    return [{ id: task.id, templateId: task.template_id, stage: task.stage, title: task.title, priority: task.priority, position: task.position, checklistTemplateId: task.checklist_template_id, expectedWorkdays: task.expected_workdays, dependsOnPositions: task.depends_on_positions }];
  });
  return validTemplates.map((template) => {
    const templateTasks = validTasks.filter((task) => task.templateId === template.id);
    const tasksByPosition = new Map(templateTasks.map((task) => [task.position, task.id]));
    return {
      id: template.id, name: template.name, projectType: template.project_type, isActive: template.is_active, isDefault: template.is_default,
      tasks: templateTasks.map((task) => ({
        id: task.id,
        stage: task.stage,
        title: task.title,
        priority: task.priority,
        position: task.position,
        checklistTemplateId: task.checklistTemplateId,
        expectedWorkdays: task.expectedWorkdays,
        dependsOnIds: task.dependsOnPositions.flatMap((position) => {
          const dependencyId = tasksByPosition.get(position);
          return dependencyId && dependencyId !== task.id ? [dependencyId] : [];
        }),
      })),
    };
  });
}
