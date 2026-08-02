import type { TaskChecklistItem } from "@/types/tasks";

export function isValidChecklistWeightInput(value: string): boolean {
  const weight = Number(value);
  return value.trim() !== "" && Number.isInteger(weight) && weight > 0 && weight <= 1000;
}

export function createOptimisticChecklistItem({
  id,
  now,
  position,
  taskId,
  title,
  weight,
}: {
  id: string;
  now: string;
  position: number;
  taskId: string;
  title: string;
  weight: number;
}): TaskChecklistItem {
  return {
    id,
    task_id: taskId,
    title,
    is_completed: false,
    weight,
    position,
    created_at: now,
    updated_at: now,
  };
}

export function replaceOptimisticChecklistItem(
  items: readonly TaskChecklistItem[],
  optimisticItemId: string,
  persistedItem: TaskChecklistItem,
): TaskChecklistItem[] {
  return items.map((item) => item.id === optimisticItemId ? persistedItem : item);
}

export function removeChecklistItem(items: readonly TaskChecklistItem[], itemId: string): TaskChecklistItem[] {
  return items.filter((item) => item.id !== itemId);
}

export function updateChecklistItemLocally(
  items: readonly TaskChecklistItem[],
  itemId: string,
  update: Partial<Pick<TaskChecklistItem, "title" | "weight" | "is_completed">>,
): TaskChecklistItem[] {
  return items.map((item) => item.id === itemId ? { ...item, ...update } : item);
}
