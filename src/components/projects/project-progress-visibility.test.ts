import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { ProjectLifecycleProvider } from "./project-lifecycle-context";
import { ProjectContextBand } from "./project-context-band";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("project progress visibility", () => {
  it("renders summary progress when enabled and removes it when disabled", () => {
    const props = {
      archiveAction: async () => {},
      canManage: false,
      currentUserId: "member",
      isArchived: false,
      project: {
        id: "project", name: "Example", project_code: null, project_type: null,
        project_type_custom: null, city: null, city_geonames_id: null,
        country_code: "UA", client_name: null, description: null, due_date: null,
        priority: "medium", start_date: "2026-05-01", total_area_m2: 0,
      },
      restoreAction: async () => {},
      stageProgressMethods: { stage_1: "equal" as const, stage_2: "equal" as const, stage_3: "equal" as const },
      tasks: [{ id: "task", stage: "stage_1", status: "completed", priority: "medium", due_date: null,
        assignee_id: null, completed_area_m2: null, manual_progress_override: false,
        production_completion: 100, progress_weight: 1, checklist_items: [] }],
      updateAction: async (state: Parameters<React.ComponentProps<typeof ProjectContextBand>["updateAction"]>[0]) => state,
    };
    const render = (showProgress: boolean) => renderToStaticMarkup(createElement(NextIntlClientProvider, {
      locale: "en", messages: en,
      children: createElement(ProjectLifecycleProvider, { initialStatus: "active",
        children: createElement(ProjectContextBand, { ...props, showProgress }) }),
    }));
    expect(render(true).match(/role="progressbar"/g)).toHaveLength(4);
    expect(render(false)).not.toContain('role="progressbar"');
  });

  it("defaults to visible and hides summary and board indicators when disabled", async () => {
    const [query, page, workspace, summary, board, dialog] = await Promise.all([
      read("../../data/queries/project-stage-columns.ts"),
      read("../../app/(app)/projects/[projectId]/page.tsx"),
      read("./project-workspace.tsx"),
      read("./project-context-band.tsx"),
      read("../tasks/project-task-board.tsx"),
      read("../tasks/project-stage-configuration-dialog.tsx"),
    ]);
    expect(query).toContain("showProgress: project?.show_progress ?? true");
    expect(page).toContain("showProgress={stageConfiguration.showProgress}");
    expect(workspace).toContain("showProgress={localShowProgress}");
    expect(workspace).toContain("setLocalShowProgress(nextShowProgress)");
    expect(summary).toContain("{showProgress ? <ProgressSummary");
    expect(board).toContain("{showProgress && progress ?");
    expect(dialog).toContain("show_progress: progressVisible");
    expect(dialog).toContain('t("showProgress")');
  });
});
