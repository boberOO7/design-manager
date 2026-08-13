import { z } from "zod";

export const studioMemberActionSchema = z.object({
  userId: z.string().uuid(),
  allowUnassigned: z.boolean(),
  reassignments: z.array(z.object({ taskId: z.string().uuid(), assigneeId: z.string().uuid() })).max(500),
});

export type StudioMemberActionState = { formError?: string; success?: "removed" | "restored" };

export function getStudioMemberActionInput(formData: FormData) {
  const userId = formData.get("user_id");
  const rawReassignments = formData.get("reassignments");
  let reassignments: unknown = [];
  if (typeof rawReassignments === "string" && rawReassignments) {
    try { reassignments = JSON.parse(rawReassignments); } catch { reassignments = null; }
  }
  return {
    userId: typeof userId === "string" ? userId : undefined,
    allowUnassigned: formData.get("allow_unassigned") === "true",
    reassignments,
  };
}
