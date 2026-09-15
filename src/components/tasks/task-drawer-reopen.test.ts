import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const taskDrawerCallers = [
  new URL("./dashboard-task-list.tsx", import.meta.url),
  new URL("./my-tasks-list.tsx", import.meta.url),
  new URL("./project-task-board.tsx", import.meta.url),
];
const myTasksPath = new URL("./my-tasks-list.tsx", import.meta.url);
const projectBoardPath = new URL("./project-task-board.tsx", import.meta.url);

describe("task drawer reopen state", () => {
  it("keeps the selected task through exit and ignores stale cleanup after reopening", async () => {
    const sources = await Promise.all(taskDrawerCallers.map((path) => readFile(path, "utf8")));

    for (const source of sources) {
      expect(source).toContain("const [selectedTaskId, setSelectedTaskId]");
      expect(source).toContain("const [isTaskDrawerOpen, setIsTaskDrawerOpen]");
      expect(source).toContain("const isTaskDrawerOpenRef = useRef");
      expect(source).toContain("function openTaskDrawer(taskId: string)");
      expect(source).toContain("setSelectedTaskId(taskId);");
      expect(source).toContain("setIsTaskDrawerOpen(true);");
      expect(source).toContain("function clearExitedTask()");
      expect(source).toContain("if (!isTaskDrawerOpenRef.current) setSelectedTaskId(null);");
      expect(source).toContain("isOpen={isTaskDrawerOpen}");
      expect(source).toContain("onExited={clearExitedTask}");
    }
  });

  it("opens My Tasks details in place and keeps project navigation as a separate action", async () => {
    const [myTasks, projectBoard] = await Promise.all([
      readFile(myTasksPath, "utf8"),
      readFile(projectBoardPath, "utf8"),
    ]);

    expect(myTasks).toContain("<TaskDetailsDrawer");
    expect(myTasks).toContain('onClick={() => openTaskDrawer(task.id)}');
    expect(myTasks).toContain('href={`/projects/${task.project_id}?task=${task.id}`}');
    expect(myTasks).toContain('aria-label={t("goToProject")}');
    expect(myTasks).toContain("onClick={(event) => event.stopPropagation()}");
    expect(projectBoard).toContain("const task = localTasks.find((item) => item.id === initialTaskId)");
    expect(projectBoard).toContain("[initialTaskId, localTasks, stageLayoutReady]");
    expect(projectBoard).toContain("[task.stage]: true");
    expect(projectBoard).toContain("setSelectedTaskId(task.id)");
    expect(projectBoard).toContain("setIsTaskDrawerOpen(true)");
    expect(projectBoard).toContain("stageElement.getAnimations()");
    expect(projectBoard).toContain("document.getElementById(getTaskCardId(targetTaskId))");
    expect(projectBoard).toContain("card.scrollIntoView({");
    expect(projectBoard).toContain('if (!initialTaskId || focusedInitialTaskIdRef.current === initialTaskId || !stageLayoutReady) return;');
  });
});
