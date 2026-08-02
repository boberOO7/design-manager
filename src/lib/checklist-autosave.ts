import type { ProjectTask, TaskChecklistItem } from "@/types/tasks";
import {
  createOptimisticChecklistItem,
  removeChecklistItem,
  replaceOptimisticChecklistItem,
  updateChecklistItemLocally,
} from "@/lib/checklist-interaction";

export type ChecklistChange = Partial<Pick<TaskChecklistItem, "title" | "weight" | "is_completed">>;

type ChecklistMutationResult = { success: true; task: ProjectTask; checklistItemId?: string };
type ChecklistSnapshot = {
  error: string | null;
  items: TaskChecklistItem[];
  pendingItemIds: ReadonlySet<string>;
};
type Listener = () => void;
type PendingUpdate = {
  change: ChecklistChange;
  previous: TaskChecklistItem;
  timer: ReturnType<typeof setTimeout> | null;
  version: number;
};

const textAutosaveDelay = 500;

function isChecklistMutationResult(value: unknown): value is ChecklistMutationResult {
  return typeof value === "object" && value !== null && "success" in value && value.success === true && "task" in value;
}

async function requestChecklistMutation(url: string, init: RequestInit): Promise<ChecklistMutationResult> {
  const response = await fetch(url, init);
  let result: unknown = null;
  try { result = await response.json(); } catch { /* A safe error is returned below. */ }
  if (!response.ok || !isChecklistMutationResult(result)) {
    const message = typeof result === "object" && result !== null && "formError" in result && typeof result.formError === "string"
      ? result.formError
      : "The checklist could not be updated. Please try again.";
    throw new Error(message);
  }
  return result;
}

export class ChecklistAutosaveStore {
  private readonly listeners = new Set<Listener>();
  private readonly pendingUpdates = new Map<string, PendingUpdate>();
  private readonly versions = new Map<string, number>();
  private items: TaskChecklistItem[] = [];
  private pendingItemIds = new Set<string>();
  private error: string | null = null;
  private taskId: string | null = null;
  private operationId = 0;

  seed(task: ProjectTask) {
    if (this.taskId !== task.id) {
      this.taskId = task.id;
      this.items = task.checklist_items;
      this.error = null;
      this.pendingItemIds = new Set();
      this.pendingUpdates.clear();
      this.versions.clear();
      this.emit();
    }
  }

  getSnapshot = (): ChecklistSnapshot => ({
    error: this.error,
    items: this.items,
    pendingItemIds: this.pendingItemIds,
  });

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  dismissError() {
    this.error = null;
    this.emit();
  }

  async create(task: ProjectTask, title: string, weight: number) {
    this.seed(task);
    const temporaryItemId = `temporary-checklist-${task.id}-${++this.operationId}`;
    const temporaryItem = createOptimisticChecklistItem({
      id: temporaryItemId,
      now: new Date().toISOString(),
      position: Math.max(-1, ...this.items.map((item) => item.position)) + 1,
      taskId: task.id,
      title,
      weight,
    });
    this.items = [...this.items, temporaryItem];
    this.setPending(temporaryItemId, true);
    this.error = null;
    this.emit();
    try {
      const result = await requestChecklistMutation(`/api/tasks/${encodeURIComponent(task.id)}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, weight }),
      });
      const persistedItem = result.checklistItemId ? result.task.checklist_items.find((item) => item.id === result.checklistItemId) : undefined;
      if (persistedItem) this.items = replaceOptimisticChecklistItem(this.items, temporaryItemId, persistedItem);
    } catch (cause) {
      this.items = removeChecklistItem(this.items, temporaryItemId);
      this.error = cause instanceof Error ? cause.message : "The checklist item could not be added.";
    } finally {
      this.setPending(temporaryItemId, false);
      this.emit();
    }
  }

  update(task: ProjectTask, itemId: string, change: ChecklistChange, immediate = false) {
    this.seed(task);
    const previous = this.items.find((item) => item.id === itemId);
    if (!previous) return;
    const version = (this.versions.get(itemId) ?? 0) + 1;
    this.versions.set(itemId, version);
    const queued = this.pendingUpdates.get(itemId);
    if (queued?.timer) clearTimeout(queued.timer);
    this.items = updateChecklistItemLocally(this.items, itemId, change);
    this.pendingUpdates.set(itemId, {
      change: queued?.timer ? { ...queued.change, ...change } : change,
      previous: queued?.timer ? queued.previous : previous,
      timer: null,
      version,
    });
    this.setPending(itemId, true);
    this.error = null;
    this.emit();
    const send = () => void this.persistUpdate(task.id, itemId, version);
    const timer = immediate ? null : setTimeout(send, textAutosaveDelay);
    const update = this.pendingUpdates.get(itemId);
    if (update && update.version === version) update.timer = timer;
    if (immediate) send();
  }

  async remove(task: ProjectTask, itemId: string) {
    this.seed(task);
    const index = this.items.findIndex((item) => item.id === itemId);
    const previous = this.items[index];
    if (!previous) return;
    this.items = removeChecklistItem(this.items, itemId);
    this.setPending(itemId, true);
    this.error = null;
    this.emit();
    try {
      await requestChecklistMutation(`/api/tasks/${encodeURIComponent(task.id)}/checklist/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    } catch (cause) {
      if (!this.items.some((item) => item.id === itemId)) {
        const restored = [...this.items];
        restored.splice(index, 0, previous);
        this.items = restored;
      }
      this.error = cause instanceof Error ? cause.message : "The checklist item could not be deleted.";
    } finally {
      this.setPending(itemId, false);
      this.emit();
    }
  }

  private async persistUpdate(taskId: string, itemId: string, version: number) {
    const pending = this.pendingUpdates.get(itemId);
    if (!pending || pending.version !== version) return;
    pending.timer = null;
    try {
      const result = await requestChecklistMutation(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.change),
      });
      if (this.versions.get(itemId) === version) {
        const persistedItem = result.task.checklist_items.find((item) => item.id === itemId);
        if (persistedItem) this.items = updateChecklistItemLocally(this.items, itemId, persistedItem);
      }
    } catch (cause) {
      if (this.versions.get(itemId) === version) {
        this.items = updateChecklistItemLocally(this.items, itemId, pending.previous);
        this.error = cause instanceof Error ? cause.message : "The checklist item could not be updated.";
      }
    } finally {
      if (this.versions.get(itemId) === version) {
        this.pendingUpdates.delete(itemId);
        this.setPending(itemId, false);
      }
      this.emit();
    }
  }

  private setPending(itemId: string, pending: boolean) {
    if (pending) this.pendingItemIds.add(itemId);
    else this.pendingItemIds.delete(itemId);
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

const stores = new Map<string, ChecklistAutosaveStore>();

export function getChecklistAutosaveStore(taskId: string) {
  let store = stores.get(taskId);
  if (!store) {
    store = new ChecklistAutosaveStore();
    stores.set(taskId, store);
  }
  return store;
}
