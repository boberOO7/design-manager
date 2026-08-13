import { z } from "zod";

export const studioMemberActionSchema = z.object({
  userId: z.string().uuid(),
  reassignmentUserId: z.string().uuid().nullable(),
});

export type StudioMemberActionState = { formError?: string; success?: "removed" | "restored" };

export function getStudioMemberActionInput(formData: FormData) {
  const userId = formData.get("user_id");
  const reassignmentUserId = formData.get("reassignment_user_id");
  return {
    userId: typeof userId === "string" ? userId : undefined,
    reassignmentUserId: typeof reassignmentUserId === "string" && reassignmentUserId ? reassignmentUserId : null,
  };
}
