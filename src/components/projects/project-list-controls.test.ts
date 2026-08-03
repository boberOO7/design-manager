import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import {
  PROJECT_LIST_HEALTH_FILTERS,
  PROJECT_LIST_HEALTH_LABEL_KEYS,
  PROJECT_LIST_LIFECYCLE_FILTERS,
  PROJECT_LIST_LIFECYCLE_LABEL_KEYS,
  PROJECT_LIST_PRIORITY_FILTERS,
  PROJECT_LIST_PRIORITY_LABEL_KEYS,
  PROJECT_LIST_SORTS,
  PROJECT_LIST_SORT_LABEL_KEYS,
} from "@/lib/project-list-presentation";

const controlsPath = new URL("./project-list-controls.tsx", import.meta.url);

describe("Projects filter localization", () => {
  it("keeps canonical values while resolving visible labels through next-intl", async () => {
    const source = await readFile(controlsPath, "utf8");

    expect(PROJECT_LIST_LIFECYCLE_FILTERS).toEqual(["all", "planned", "active", "paused", "completed"]);
    expect(PROJECT_LIST_HEALTH_FILTERS).toEqual(["all", "overdue", "needs_attention", "deadline_soon", "on_track", "completed"]);
    expect(PROJECT_LIST_PRIORITY_FILTERS).toEqual(["all", "urgent", "high", "normal", "low"]);
    expect(PROJECT_LIST_SORTS).toEqual(["operational", "deadline", "name", "health", "progress"]);
    expect(source).toContain('useTranslations("Projects")');
    expect(source).toContain('useTranslations("Priority")');
    expect(source).toContain("PROJECT_LIST_LIFECYCLE_LABEL_KEYS[option]");
    expect(source).not.toContain('planned: "Planned"');
  });

  it("provides every required Ukrainian option label", () => {
    expect(PROJECT_LIST_LIFECYCLE_FILTERS.slice(1).map((value) => uk.Projects[PROJECT_LIST_LIFECYCLE_LABEL_KEYS[value]])).toEqual(["Заплановано", "Активний", "Призупинено", "Завершено"]);
    expect(PROJECT_LIST_HEALTH_FILTERS.slice(1).map((value) => uk.Projects[PROJECT_LIST_HEALTH_LABEL_KEYS[value]])).toEqual(["Прострочено", "Потребує уваги", "Скоро дедлайн", "За планом", "Завершено"]);
    expect((["urgent", "high", "normal", "low"] as const).map((value) => uk.Priority[PROJECT_LIST_PRIORITY_LABEL_KEYS[value]])).toEqual(["Терміновий", "Високий", "Звичайний", "Низький"]);
    expect(PROJECT_LIST_SORTS.map((value) => uk.Projects[PROJECT_LIST_SORT_LABEL_KEYS[value]])).toEqual(["Операційний пріоритет", "Дедлайн", "Назва", "Стан", "Прогрес"]);
    expect(PROJECT_LIST_SORTS.map((value) => en.Projects[PROJECT_LIST_SORT_LABEL_KEYS[value]])).toEqual(["Operational priority", "Deadline", "Name", "Health", "Progress"]);
  });
});
