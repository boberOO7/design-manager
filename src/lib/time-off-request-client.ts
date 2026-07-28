import type { CalendarItem } from "@/types/calendar";

export type TimeOffMutationResult = { success: true; item?: CalendarItem | null; removedKey?: string | null };

export function isTimeOffMutationResult(value: unknown): value is TimeOffMutationResult {
  if (typeof value !== "object" || value === null || !("success" in value) || value.success !== true) return false;
  if ("item" in value && value.item !== null && value.item !== undefined && !(typeof value.item === "object" && "key" in value.item && typeof value.item.key === "string")) return false;
  return !("removedKey" in value) || value.removedKey === null || value.removedKey === undefined || typeof value.removedKey === "string";
}

export async function updateTimeOffRequest(requestId: string, action: "approve" | "reject" | "cancel", reviewNote = ""): Promise<TimeOffMutationResult> {
  const response = await fetch(`/api/calendar/time-off/${encodeURIComponent(requestId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reviewNote }) });
  const result: unknown = await response.json();
  if (!response.ok || !isTimeOffMutationResult(result)) throw new Error("The request could not be updated.");
  return result;
}
