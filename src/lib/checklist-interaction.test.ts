import { describe, expect, it } from "vitest";
import {
  createOptimisticChecklistItem,
  isValidChecklistWeightInput,
  removeChecklistItem,
  replaceOptimisticChecklistItem,
  updateChecklistItemLocally,
} from "./checklist-interaction";

const taskId = "123e4567-e89b-12d3-a456-426614174000";
const timestamp = "2026-07-30T12:00:00.000Z";

function item(id: string, title = "Drawings") {
  return createOptimisticChecklistItem({ id, now: timestamp, position: 0, taskId, title, weight: 1 });
}

describe("checklist interaction helpers", () => {
  it("accepts whole checklist weights only", () => {
    expect(isValidChecklistWeightInput("1")).toBe(true);
    expect(isValidChecklistWeightInput("1000")).toBe(true);
    expect(isValidChecklistWeightInput("1.5")).toBe(false);
    expect(isValidChecklistWeightInput("0")).toBe(false);
    expect(isValidChecklistWeightInput("-1")).toBe(false);
    expect(isValidChecklistWeightInput("1001")).toBe(false);
  });

  it("reconciles a persisted item without dropping a later optimistic insertion", () => {
    const first = item("temporary-first", "Plans");
    const second = item("temporary-second", "Lighting");
    const persistedFirst = { ...first, id: "persisted-first", position: 3 };

    expect(replaceOptimisticChecklistItem([first, second], first.id, persistedFirst)).toEqual([persistedFirst, second]);
  });

  it("rolls back only the failed optimistic insertion", () => {
    const first = item("temporary-first", "Plans");
    const second = item("temporary-second", "Lighting");

    expect(removeChecklistItem([first, second], first.id)).toEqual([second]);
  });

  it("updates only the requested item during optimistic completion and edits", () => {
    const first = item("first", "Plans");
    const second = item("second", "Lighting");

    expect(updateChecklistItemLocally([first, second], first.id, { is_completed: true, weight: 2 })).toEqual([
      { ...first, is_completed: true, weight: 2 },
      second,
    ]);
  });
});
