"use server";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { commentSubmissionSchema, createSubmissionSchema, manageSubmissionSchema, type SubmissionActionState } from "@/lib/validation/submission";

const refresh = () => revalidatePath("/submissions");

export async function createSubmission(_state: SubmissionActionState, formData: FormData): Promise<SubmissionActionState> {
  const membership = await getActiveStudioMembership();
  if (!membership) return { error: "permission" };
  const parsed = createSubmissionSchema.safeParse({
    type: formData.get("type"), title: formData.get("title"), description: formData.get("description"),
    anonymous: formData.get("anonymous") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_submission", {
    p_type: parsed.data.type, p_title: parsed.data.title, p_description: parsed.data.description, p_anonymous: parsed.data.anonymous,
  });
  if (error || !data) { console.error("Unable to create submission", error); return { error: "create" }; }
  refresh();
  return parsed.data.anonymous ? { success: true, anonymousSubmitted: true } : { success: true, submissionId: data };
}

export async function addSubmissionComment(input: { submissionId: string; body: string }): Promise<{ error?: string }> {
  const membership = await getActiveStudioMembership();
  const parsed = commentSubmissionSchema.safeParse(input);
  if (!membership || !parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data: submission, error: readError } = await supabase.from("submissions").select("studio_id").eq("id", parsed.data.submissionId).maybeSingle();
  if (readError || !submission) return { error: "permission" };
  const { error } = await supabase.from("submission_comments").insert({ submission_id: parsed.data.submissionId, studio_id: submission.studio_id, author_id: membership.authenticatedUserId, body: parsed.data.body });
  if (error) { console.error("Unable to add submission comment", error); return { error: "comment" }; }
  refresh(); return {};
}

export async function toggleSuggestionSupport(submissionId: string, supported: boolean): Promise<{ error?: string }> {
  const membership = await getActiveStudioMembership();
  if (!membership) return { error: "permission" };
  const supabase = await createClient();
  const query = supabase.from("submission_reactions");
  const { error } = supported
    ? await query.delete().eq("submission_id", submissionId).eq("user_id", membership.authenticatedUserId)
    : await query.insert({ submission_id: submissionId, studio_id: membership.studio_id, user_id: membership.authenticatedUserId });
  if (error) { console.error("Unable to toggle suggestion support", error); return { error: "support" }; }
  refresh(); return {};
}

export async function manageSubmission(input: { submissionId: string; status: string; responsibleId: string | null; priority: string | null; deadline: string | null; internalNote: string }): Promise<{ error?: string }> {
  const [admin, parsed] = await Promise.all([getActiveStudioAdmin(), Promise.resolve(manageSubmissionSchema.safeParse(input))]);
  if (!admin) return { error: "permission" };
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("manage_submission", {
    p_submission_id: parsed.data.submissionId, p_status: parsed.data.status,
    p_responsible_id: parsed.data.responsibleId, p_priority: parsed.data.priority,
    p_deadline: parsed.data.deadline, p_internal_note: parsed.data.internalNote,
  });
  if (error) { console.error("Unable to manage submission", error); return { error: error.message.includes("invalid_submission_transition") ? "transition" : "manage" }; }
  refresh(); return {};
}
