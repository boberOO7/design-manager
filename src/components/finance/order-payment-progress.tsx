import type { projectOrderPaymentProgress } from "@/lib/finance-project-view";

type Progress = ReturnType<typeof projectOrderPaymentProgress>;

export function orderPaymentStateClass(state: Progress["state"]) {
  return state === "paid" ? "text-[var(--ui-success-text)]" : state === "partial" ? "text-[var(--ui-warning-text)]" : "text-[var(--ui-text-secondary)]";
}
