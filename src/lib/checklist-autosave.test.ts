import { afterEach, describe, expect, it, vi } from "vitest";
import { ChecklistAutosaveStore } from "./checklist-autosave";
import type { ProjectTask, TaskChecklistItem } from "@/types/tasks";

const taskId = "123e4567-e89b-12d3-a456-426614174000";
const timestamp = "2026-08-02T10:00:00.000Z";

function item(id: string, title = "Plans"): TaskChecklistItem {
  return { created_at: timestamp, id, is_completed: false, position: 0, task_id: taskId, title, updated_at: timestamp, weight: 1 };
}

function task(items: TaskChecklistItem[] = [item("first")]): ProjectTask {
  return {
    assignee: null,
    assignee_id: "323e4567-e89b-12d3-a456-426614174000",
    checklist_items: items,
    completed_area_m2: null,
    completed_at: null,
    created_at: timestamp,
    created_by: "423e4567-e89b-12d3-a456-426614174000",
    creator: null,
    description: null,
    due_date: null,
    id: taskId,
    priority: "normal",
    production_completion: 0,
    progress_weight: 1,
    project_id: "223e4567-e89b-12d3-a456-426614174000",
    status: "in_progress",
    title: "Task",
  };
}

function response(updatedTask: ProjectTask) {
  return new Response(JSON.stringify({ success: true, task: updatedTask }), { headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("checklist autosave store", () => {
  it("updates checkbox completion optimistically and persists it immediately", async () => {
    const currentTask = task();
    const fetchMock = vi.fn().mockResolvedValue(response(task([{ ...currentTask.checklist_items[0], is_completed: true }])));
    vi.stubGlobal("fetch", fetchMock);
    const store = new ChecklistAutosaveStore();

    store.update(currentTask, "first", { is_completed: true }, true);

    expect(store.getSnapshot().items[0].is_completed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("debounces title and weight persistence", async () => {
    vi.useFakeTimers();
    const currentTask = task();
    const fetchMock = vi.fn().mockResolvedValue(response(task([{ ...currentTask.checklist_items[0], title: "Updated", weight: 3 }])));
    vi.stubGlobal("fetch", fetchMock);
    const store = new ChecklistAutosaveStore();

    store.update(currentTask, "first", { title: "Updated" });
    store.update(currentTask, "first", { weight: 3 });
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ title: "Updated", weight: 3 });
  });

  it("keeps the latest local edit when older responses finish later", async () => {
    const currentTask = task();
    let resolveFirst: ((value: Response) => void) | undefined;
    let resolveSecond: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSecond = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const store = new ChecklistAutosaveStore();

    store.update(currentTask, "first", { title: "Older" }, true);
    store.update(currentTask, "first", { title: "Latest" }, true);
    resolveSecond?.(response(task([{ ...currentTask.checklist_items[0], title: "Latest" }])));
    await vi.waitFor(() => expect(store.getSnapshot().pendingItemIds.has("first")).toBe(false));
    resolveFirst?.(response(task([{ ...currentTask.checklist_items[0], title: "Older" }])));
    await Promise.resolve();

    expect(store.getSnapshot().items[0].title).toBe("Latest");
  });

  it("rolls back only the failed item and keeps a useful accessible error", async () => {
    const second = item("second", "Lighting");
    const currentTask = task([item("first"), second]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ formError: "Checklist title is required" }), { status: 400 })));
    const store = new ChecklistAutosaveStore();

    store.update(currentTask, "first", { title: "Broken" }, true);
    await vi.waitFor(() => expect(store.getSnapshot().error).toBe("Checklist title is required"));

    expect(store.getSnapshot().items).toEqual([currentTask.checklist_items[0], second]);
  });

  it("continues queued persistence after its UI subscriber is removed", async () => {
    vi.useFakeTimers();
    const currentTask = task();
    const fetchMock = vi.fn().mockResolvedValue(response(task([{ ...currentTask.checklist_items[0], title: "Persisted" }])));
    vi.stubGlobal("fetch", fetchMock);
    const store = new ChecklistAutosaveStore();
    const unsubscribe = store.subscribe(vi.fn());

    store.update(currentTask, "first", { title: "Persisted" });
    unsubscribe();
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().items[0].title).toBe("Persisted");
  });
});
