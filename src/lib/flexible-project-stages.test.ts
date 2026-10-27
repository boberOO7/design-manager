import { describe, expect, it } from "vitest";
import { calculateProjectSummary, type ProjectTaskForProgress } from "./project-progress";
import { canWorkOnTaskInProject, countOpenLifecycleTasks, getAutomaticProjectStatus, getTaskCreationStagesForProject } from "./project-lifecycle";
import { DEFAULT_PROJECT_STAGES, type ProjectStageDefinition } from "./task-stages";
import { getProductivityStageMode } from "./productivity";
import { taskCreationSchema, projectTemplateStageApplicationSchema } from "./validation/task";

const work = { stage: "custom_12345678-1234-1234-1234-123456789abc", kind: "work", progressWeight: 1 } satisfies ProjectStageDefinition;
const additional = { stage: "custom_12345678-1234-1234-1234-123456789abd", kind: "additional", progressWeight: 1 } satisfies ProjectStageDefinition;
const stages = [...DEFAULT_PROJECT_STAGES, work, additional];
function task(stage: string, status = "completed"): ProjectTaskForProgress {
  return { id: stage, stage, status, priority: "normal", due_date: null, assignee_id: null, completed_area_m2: null, manual_progress_override: false, production_completion: 0, progress_weight: 1, checklist_items: [] };
}

describe("project-owned stages", () => {
  it("preserves legacy shares, adds weighted work and excludes additional stages", () => {
    const tasks = [task("stage_1"), task(work.stage), task(additional.stage)];
    expect(calculateProjectSummary(tasks).progress.rawProgressPercent).toBe(20);
    expect(calculateProjectSummary(tasks, undefined, undefined, stages).progress.rawProgressPercent).toBeCloseTo(100 / 3);
    expect(calculateProjectSummary(tasks, undefined, undefined, stages).stageProgress[additional.stage]).toBeUndefined();
  });
  it("renormalizes after deletion, keeps hidden work and counts empty stages as zero", () => {
    const hiddenWork = { ...work, isEnabled: false };
    expect(calculateProjectSummary([task(work.stage)], undefined, undefined, [hiddenWork]).progress.progressPercent).toBe(100);
    expect(calculateProjectSummary([task(work.stage)], undefined, undefined, [work, DEFAULT_PROJECT_STAGES[0]]).progress.progressPercent).toBe(50);
    expect(calculateProjectSummary([task(additional.stage)], undefined, undefined, [additional]).progress.progressPercent).toBe(0);
  });
  it("uses stage type for activation, completion and post-completion writes", () => {
    expect(getAutomaticProjectStatus("planned", "in_progress", work.stage, stages)).toBe("active");
    expect(getAutomaticProjectStatus("planned", "in_progress", additional.stage, stages)).toBe("planned");
    expect(countOpenLifecycleTasks([{ stage: work.stage, status: "todo" }, { stage: additional.stage, status: "todo" }], stages)).toBe(1);
    expect(canWorkOnTaskInProject({ projectStatus: "completed", stage: work.stage, stages })).toBe(false);
    expect(canWorkOnTaskInProject({ projectStatus: "completed", stage: additional.stage, stages })).toBe(true);
    expect(canWorkOnTaskInProject({ projectStatus: "archived", stage: additional.stage, stages })).toBe(false);
    expect(getTaskCreationStagesForProject({ projectStatus: "completed", stages })).toEqual(["stage_4", additional.stage]);
    expect(getProductivityStageMode(work.stage)).toBe("none");
    expect(getProductivityStageMode(additional.stage)).toBe("none");
  });
  it("accepts a custom task destination while template sources stay canonical", () => {
    expect(taskCreationSchema.safeParse({ title: "Extra", stage: work.stage, priority: "normal", assignee_id: null, collaborator_ids: [], deadlines: [], checklist_items: [] }).success).toBe(true);
    const input = { project_id: "12345678-1234-4234-8234-123456789abc", template_id: "12345678-1234-4234-8234-123456789abc", source_stage: "stage_1", destination_stage: work.stage, anchor_date: "" };
    expect(projectTemplateStageApplicationSchema.safeParse(input).success).toBe(true);
    expect(projectTemplateStageApplicationSchema.safeParse({ ...input, source_stage: work.stage }).success).toBe(false);
  });
});
