import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const taskDrawerCallers = [
  new URL("./dashboard-task-list.tsx", import.meta.url),
  new URL("./my-tasks-list.tsx", import.meta.url),
  new URL("./project-task-board.tsx", import.meta.url),
];

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
});
