"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { getTemplateStageTasks, isProjectTemplateStage, PROJECT_TEMPLATE_STAGES, type ProjectTemplate, type ProjectTemplateStage } from "@/lib/project-templates";
import type { TaskStage } from "@/lib/task-stages";
import type { ProjectTask } from "@/types/tasks";

function isSuccessfulResponse(value: unknown): value is { success: true; createdCount: number; tasks: ProjectTask[] } {
  return typeof value === "object"
    && value !== null
    && "success" in value
    && value.success === true
    && "createdCount" in value
    && typeof value.createdCount === "number"
    && "tasks" in value
    && Array.isArray(value.tasks);
}

export function ProjectTemplateStageDialog({ destinationStage, destinationStageName, onApplied, onClose, projectId, templates }: {
  destinationStage: TaskStage;
  destinationStageName: string;
  onApplied: (tasks: ProjectTask[], createdCount: number) => void;
  onClose: () => void;
  projectId: string;
  templates: ProjectTemplate[];
}) {
  const t = useTranslations("ProjectTemplates");
  const tasksT = useTranslations("Tasks");
  const stages = useTranslations("TaskStages");
  const initialTemplate = templates[0] ?? null;
  const initialSourceStage = PROJECT_TEMPLATE_STAGES.find((stage) => getTemplateStageTasks(initialTemplate, stage).length > 0) ?? "stage_1";
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [sourceStage, setSourceStage] = useState<ProjectTemplateStage>(initialSourceStage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null;
  const selectedTasks = getTemplateStageTasks(selectedTemplate, sourceStage);

  function selectTemplate(nextTemplateId: string) {
    const nextTemplate = templates.find((template) => template.id === nextTemplateId) ?? null;
    const nextSourceStage = PROJECT_TEMPLATE_STAGES.find((stage) => getTemplateStageTasks(nextTemplate, stage).length > 0) ?? "stage_1";
    setTemplateId(nextTemplateId);
    setSourceStage(nextSourceStage);
    setError(null);
  }

  async function apply() {
    if (!selectedTemplate || selectedTasks.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/tasks/apply-template-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: selectedTemplate.id, source_stage: sourceStage, destination_stage: destinationStage }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSuccessfulResponse(result)) throw new Error(t("applyStageFailed"));
      onApplied(result.tasks, result.createdCount);
    } catch {
      setError(t("applyStageFailed"));
      setSaving(false);
    }
  }

  return <Dialog closeDisabled={saving} closeLabel={tasksT("cancel")} description={t("applyStageDescription", { stage: destinationStageName })} isOpen onRequestClose={() => { if (!saving) onClose(); }} title={t("applyStageTitle")} className="max-w-[32rem]">
    <form onSubmit={(event) => { event.preventDefault(); void apply(); }} className="overflow-y-auto p-5">
      <div className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-3 py-2.5">
        <p className="text-xs font-medium text-[var(--ui-text-muted)]">{t("destinationStage")}</p>
        <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{destinationStageName}</p>
      </div>
      <div className="mt-4 space-y-4">
        <FormField label={t("templateLabel")}>
          <Select data-dialog-initial-focus value={templateId} placeholder={t("chooseTemplate")} disabled={saving || templates.length === 0} onValueChange={selectTemplate}>
            {templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
          </Select>
        </FormField>
        <FormField label={t("sourceStage")}>
          <Select value={sourceStage} disabled={saving || !selectedTemplate} onValueChange={(stage) => { if (isProjectTemplateStage(stage)) { setSourceStage(stage); setError(null); } }}>
            {PROJECT_TEMPLATE_STAGES.map((stage) => {
              const taskCount = getTemplateStageTasks(selectedTemplate, stage).length;
              return <SelectItem key={stage} value={stage} disabled={taskCount === 0}>{stages(stage)} · {t("taskCount", { count: taskCount })}</SelectItem>;
            })}
          </Select>
        </FormField>
      </div>
      {selectedTemplate && selectedTasks.length > 0 ? <div className="mt-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] px-3 py-3"><p className="text-sm font-medium text-[var(--ui-text)]">{t("tasksWillBeAdded", { count: selectedTasks.length })}</p><p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{t("existingTasksRemain")}</p></div> : <p className="mt-4 text-sm text-[var(--ui-text-muted)]">{templates.length === 0 ? t("noTemplates") : t("emptySourceStage")}</p>}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2 border-t border-[var(--ui-border-subtle)] pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>{tasksT("cancel")}</Button>
        <Button type="submit" disabled={saving || !selectedTemplate || selectedTasks.length === 0}>{saving ? t("applyingStage") : t("applyStage")}</Button>
      </div>
    </form>
  </Dialog>;
}
