"use server";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getCurrentUserProfile } from "@/data/queries";
import { getAuthConfirmationUrl } from "@/lib/auth/confirmation-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  employeeInvitationSchema,
  getEmployeeInvitationInput,
  getEmployeeInvitationPayload,
  type EmployeeInvitationActionState,
  type EmployeeInvitationField,
} from "@/lib/validation/employee-invitation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getStudioMemberActionInput, studioMemberActionSchema, type StudioMemberActionState } from "@/lib/validation/team-membership";
import { z } from "zod";

function isExistingAuthUserError(code: string | undefined): boolean {
  return code === "email_exists" || code === "user_already_exists";
}

export async function inviteEmployee(
  _previousState: EmployeeInvitationActionState,
  formData: FormData,
): Promise<EmployeeInvitationActionState> {
  // These canonical helpers both use the normal authenticated SSR client.
  // The Profile check deliberately happens before resolving authorization
  // from the caller's active studio membership.
  let profile: Awaited<ReturnType<typeof getCurrentUserProfile>>;
  try {
    profile = await getCurrentUserProfile();
  } catch (error) {
    console.error("Unable to verify the inviting administrator's Profile", error);
    return { formError: "Your Profile could not be verified. Please try again." };
  }

  if (!profile || !profile.is_active) {
    return { formError: "You must be signed in with an active Profile to invite employees." };
  }

  const membership = await getActiveStudioMembership();
  if (!membership || membership.authenticatedUserId !== profile.id) {
    return { formError: "No active studio membership is available for this invitation." };
  }

  if (profile.system_role !== "admin" || membership.system_role !== "admin") {
    return { formError: "Only active studio administrators can invite employees." };
  }

  const parsed = employeeInvitationSchema.safeParse(getEmployeeInvitationInput(formData));
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    const fieldErrors: Partial<Record<EmployeeInvitationField, string>> = {};

    const fields = ["email", "full_name", "job_title"] satisfies EmployeeInvitationField[];
    for (const field of fields) {
      const message = flattened[field]?.[0];
      if (message) fieldErrors[field] = message;
    }

    return { formError: "Please correct the highlighted fields.", fieldErrors };
  }

  const requestHeaders = await headers();
  const redirectTo = getAuthConfirmationUrl(requestHeaders.get("origin"));
  if (!redirectTo) {
    console.error("Unable to build the employee invitation callback URL from the request origin.");
    return { formError: "Employee invitations are not configured for this application URL." };
  }

  // The RLS-bypassing client is created only after all authentication,
  // membership, role, and input checks above have succeeded.
  let supabaseAdmin: ReturnType<typeof createAdminClient>;
  try {
    supabaseAdmin = createAdminClient();
  } catch (error) {
    console.error("Unable to initialize the Supabase admin client", error);
    return { formError: "Employee invitations are not configured on the server." };
  }

  const invitation = parsed.data;
  const invitationPayload = getEmployeeInvitationPayload(invitation);
  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(invitationPayload.email, {
      data: invitationPayload.data,
      redirectTo,
    });

  if (inviteError || !inviteData.user) {
    console.error("Unable to invite employee with Supabase Auth", {
      code: inviteError?.code,
      status: inviteError?.status,
    });

    if (isExistingAuthUserError(inviteError?.code)) {
      return { formError: "An account or pending invitation already exists for this email address." };
    }

    return { formError: "The invitation could not be sent. Please try again later." };
  }

  const invitedUserId = inviteData.user.id;
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: invitedUserId,
      email: invitation.email,
      full_name: invitation.full_name,
      job_title: invitation.job_title,
      system_role: "employee",
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error("Employee invitation sent but Profile provisioning failed", {
      invitedUserId,
      code: profileError.code,
    });
    return {
      formError:
        "The invitation email was sent, but employee setup could not be completed. Contact support before retrying.",
    };
  }

  const { error: membershipError } = await supabaseAdmin.from("studio_members").upsert(
    {
      studio_id: membership.studio_id,
      user_id: invitedUserId,
      system_role: "employee",
      is_active: true,
    },
    { onConflict: "studio_id,user_id" },
  );

  if (membershipError) {
    console.error("Employee invitation sent but studio membership provisioning failed", {
      invitedUserId,
      studioId: membership.studio_id,
      code: membershipError.code,
    });
    return {
      formError:
        "The invitation email was sent, but studio access could not be completed. Contact support before retrying.",
    };
  }

  revalidatePath("/team");
  return { success: `Invitation sent to ${invitation.email}.` };
}

export async function removeStudioMember(_previousState: StudioMemberActionState, formData: FormData): Promise<StudioMemberActionState> {
  const membership = await getActiveStudioMembership();
  if (!membership || membership.system_role !== "admin") return { formError: "Only active studio administrators can remove employees." };
  const parsed = studioMemberActionSchema.safeParse(getStudioMemberActionInput(formData));
  if (!parsed.success || parsed.data.userId === membership.authenticatedUserId) return { formError: "This member cannot be removed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_studio_member", {
    p_user_id: parsed.data.userId,
    p_allow_unassigned: parsed.data.allowUnassigned,
    p_reassignments: parsed.data.reassignments,
  });
  if (error) {
    console.error("Unable to remove studio member", error);
    return { formError: "The member could not be removed. Review open work and try again." };
  }
  revalidatePath("/team"); revalidatePath("/dashboard"); revalidatePath("/projects"); revalidatePath("/my-tasks");
  return { success: "removed" };
}

export async function restoreStudioMember(_previousState: StudioMemberActionState, formData: FormData): Promise<StudioMemberActionState> {
  const membership = await getActiveStudioMembership();
  const userId = formData.get("user_id");
  if (!membership || membership.system_role !== "admin" || typeof userId !== "string" || !z.string().uuid().safeParse(userId).success) return { formError: "Only active studio administrators can restore employees." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_studio_member", { p_user_id: userId });
  if (error) { console.error("Unable to restore studio member", error); return { formError: "The member could not be restored. Please try again." }; }
  revalidatePath("/team"); revalidatePath("/dashboard"); revalidatePath("/projects");
  return { success: "restored" };
}
