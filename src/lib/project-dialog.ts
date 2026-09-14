import type { DialogCloseReason } from "@/components/ui/dialog";

export function getProjectDialogCloseIntent(mode: "create" | "edit", isDirty: boolean, reason: DialogCloseReason): "close" | "confirm" | "ignore" {
  if (mode === "create" || !isDirty) return "close";
  return reason === "outside" ? "ignore" : "confirm";
}
