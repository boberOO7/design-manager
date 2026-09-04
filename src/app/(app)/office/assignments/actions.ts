"use server";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { createOfficeAssignmentSchema, manageOfficeAssignmentSchema, transitionOfficeAssignmentSchema, type OfficeAssignmentActionState } from "@/lib/validation/office-assignment";

function refreshOffice() {
  revalidatePath("/office");
  revalidatePath("/office/assignments");
}

export async function createOfficeAssignment(_state: OfficeAssignmentActionState, formData: FormData): Promise<OfficeAssignmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = createOfficeAssignmentSchema.safeParse({
    title: formData.get("title"), description: formData.get("description"), responsibleId: formData.get("responsibleId"),
    priority: formData.get("priority"), deadline: formData.get("deadline"),
  });
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_office_assignment", {
    p_title: parsed.data.title, p_description: parsed.data.description, p_responsible_id: parsed.data.responsibleId,
    p_priority: parsed.data.priority, p_deadline: parsed.data.deadline,
  });
  if (error || !data) { console.error("Unable to create office assignment", error); return { error: "create" }; }
  refreshOffice();
  return { success: true, assignmentId: data };
}

export async function transitionOfficeAssignment(input: { assignmentId: string; status: string }): Promise<{ error?: string }> {
  const membership = await getActiveStudioMembership();
  const parsed = transitionOfficeAssignmentSchema.safeParse(input);
  if (!membership || !parsed.success) return { error: "permission" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_office_assignment", { p_assignment_id: parsed.data.assignmentId, p_status: parsed.data.status });
  if (error) { console.error("Unable to transition office assignment", error); return { error: error.message.includes("transition") ? "transition" : "permission" }; }
  refreshOffice(); return {};
}

export async function manageOfficeAssignment(input: { assignmentId: string; status: string; responsibleId: string; priority: string; deadline: string | null }): Promise<{ error?: string }> {
  const admin = await getActiveStudioAdmin();
  const parsed = manageOfficeAssignmentSchema.safeParse(input);
  if (!admin) return { error: "permission" };
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("manage_office_assignment", {
    p_assignment_id: parsed.data.assignmentId, p_status: parsed.data.status, p_responsible_id: parsed.data.responsibleId,
    p_priority: parsed.data.priority, p_deadline: parsed.data.deadline,
  });
  if (error) { console.error("Unable to manage office assignment", error); return { error: error.message.includes("transition") ? "transition" : "manage" }; }
  refreshOffice(); return {};
}
