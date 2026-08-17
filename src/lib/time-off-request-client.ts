import type { CalendarItem } from "@/types/calendar";

export type TimeOffMutationResult = { success: true; item?: CalendarItem | null; removedKey?: string | null; requiresRefresh?: boolean; approvalCount?: number; requiredApprovalCount?: number; hasCurrentAdminApproved?: boolean };

export function isTimeOffMutationResult(value: unknown): value is TimeOffMutationResult {
  if (typeof value !== "object" || value === null || !("success" in value) || value.success !== true) return false;
  if ("item" in value && value.item !== null && value.item !== undefined && !(typeof value.item === "object" && "key" in value.item && typeof value.item.key === "string")) return false;
  if ("removedKey" in value && value.removedKey !== null && value.removedKey !== undefined && typeof value.removedKey !== "string") return false;
  if ("approvalCount" in value && value.approvalCount !== undefined && typeof value.approvalCount !== "number") return false;
  if ("requiredApprovalCount" in value && value.requiredApprovalCount !== undefined && typeof value.requiredApprovalCount !== "number") return false;
  if ("hasCurrentAdminApproved" in value && value.hasCurrentAdminApproved !== undefined && typeof value.hasCurrentAdminApproved !== "boolean") return false;
  return !("requiresRefresh" in value) || value.requiresRefresh === undefined || typeof value.requiresRefresh === "boolean";
}

export async function updateTimeOffRequest(requestId: string, action: "approve" | "reject" | "cancel", reviewNote = ""): Promise<TimeOffMutationResult> {
  const response = await fetch(`/api/calendar/time-off/${encodeURIComponent(requestId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reviewNote }) });
  const responseText = await response.text();
  let result: unknown;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error("The request could not be updated.");
  }
  if (!response.ok || !isTimeOffMutationResult(result)) {
    const formError = typeof result === "object" && result !== null && "formError" in result && typeof result.formError === "string" ? result.formError : "The request could not be updated.";
    throw new Error(formError);
  }
  return result;
}
