import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import { ProjectLifecycleProvider } from "./project-lifecycle-context";
import { ProjectContextBand } from "./project-context-band";
import { calculateProjectSummary } from "@/lib/project-progress";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("project progress visibility", () => {
  it("keeps common project identity above the direction workspace", () => {
    const props = {
      archiveAction: async () => {},

      canManage: false,
      currentUserId: "member",
      isArchived: false,
      project: {
        id: "project", name: "Example", project_code: null, project_type: null,
        project_type_custom: null, city: null, city_geonames_id: null, site_address: null,
        country_code: "UA", client_name: null, description: null, due_date: null,
        priority: "normal", start_date: "2026-05-01", total_area_m2: 0,
      },
      restoreAction: async () => {},
      summary: calculateProjectSummary([{ id: "task", stage: "stage_1", status: "completed", priority: "medium", due_date: null,
        assignee_id: null, completed_area_m2: null, manual_progress_override: false,
        production_completion: 100, progress_weight: 1, checklist_items: [] }]),
      updateAction: async (state: Parameters<React.ComponentProps<typeof ProjectContextBand>["updateAction"]>[0]) => state,
    };
    const render = (locale = "en", dueDate: string | null = null) => renderToStaticMarkup(createElement(NextIntlClientProvider, {
      locale, messages: locale === "uk" ? uk : en,
      children: createElement(ProjectLifecycleProvider, { initialStatus: "active",
        children: createElement(ProjectContextBand, { ...props, project: { ...props.project, due_date: dueDate }, directionsContent: createElement("nav", { "aria-label": "Directions" }, "Interior · 120 m²") }) }),
    }));
    expect(render()).toContain('aria-label="Directions"');
    expect(render()).toContain("Interior · 120 m²");
    expect(render()).not.toContain('role="progressbar"');
    const localized = render("uk", "2000-01-01");
    expect(localized).toContain("Активний");
    expect(localized).toContain("Прострочено");
    expect(localized).not.toContain("Дедлайн проєкту минув");
    expect(localized).not.toMatch(/Overdue|Normal|Project deadline passed|Дедлайн наступного завдання/);
  });

  it("keeps the progress preference on the direction collection and board", async () => {
    const [directions, board] = await Promise.all([read("./project-work-directions.tsx"), read("../tasks/project-task-board.tsx")]);
    expect(directions).toContain("configuration.showProgress");
    expect(board).toContain("{showProgress && progress ?");
  });
});
