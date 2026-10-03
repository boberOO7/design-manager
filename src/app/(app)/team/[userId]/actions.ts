"use server";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { employeeProfileNoteSchema } from "@/lib/validation/employee-profile-note";

export async function addEmployeeProfileNote(formData: FormData): Promise<{ success: boolean }> {
  const parsed = employeeProfileNoteSchema.safeParse({
    employeeId: formData.get("employeeId"), reviewMonth: formData.get("reviewMonth"), note: formData.get("note"),
  });
  if (!parsed.success) return { success: false };
  try {
    const admin = await getActiveStudioAdmin();
    if (!admin) return { success: false };
    const { error } = await (await createClient()).from("employee_profile_notes").insert({
      studio_id: admin.studio_id,
      employee_id: parsed.data.employeeId,
      review_month: `${parsed.data.reviewMonth}-01`,
      note: parsed.data.note,
    });
    if (error) return { success: false };
    revalidatePath(`/team/${parsed.data.employeeId}`);
    return { success: true };
  } catch {
    return { success: false };
  }
}
