import type { DialogCloseReason } from "@/components/ui/dialog";

export function getProjectDialogCloseIntent(isDirty: boolean, reason: DialogCloseReason): "close" | "confirm" | "ignore" {
  if (!isDirty) return "close";
  return reason === "outside" ? "ignore" : "confirm";
}
