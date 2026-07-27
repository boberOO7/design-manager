"use server";

import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/data/queries";
import { createClient } from "@/lib/supabase/server";
import { projectSchema, type ProjectFormValues } from "@/lib/validation/project";
import type { Profile } from "@/types";

export type CreateProjectActionState = {
  error: string;
  fieldErrors?: Partial<Record<keyof ProjectFormValues, string>>;
};

export async function createProject(input: unknown): Promise<CreateProjectActionState> {
  const parsed = projectSchema.safeParse(input);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    const fieldErrors: Partial<Record<keyof ProjectFormValues, string>> = {};

    for (const field of Object.keys(flattened) as Array<keyof ProjectFormValues>) {
      const message = flattened[field]?.[0];
      if (message) fieldErrors[field] = message;
    }

    return { error: "Please correct the highlighted fields.", fieldErrors };
  }

  let profile: Profile | null;

  try {
    profile = await getCurrentUserProfile();
  } catch (error) {
    console.error("Unable to verify project creator profile", error);
    return { error: "Your administrator profile could not be verified. Please try again." };
  }

  if (!profile || !profile.is_active || profile.system_role !== "admin") {
    return { error: "Only active administrators can create projects." };
  }

  const userId = profile.id;
  const supabase = await createClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", userId)
    .eq("system_role", "admin")
    .eq("is_active", true)
    .order("joined_at", { ascending: true })
    .limit(2);

  if (membershipError) {
    console.error("Unable to resolve project creator studio membership", membershipError);
    return { error: "Your studio membership could not be verified. Please try again." };
  }

  if (memberships?.length !== 1) {
    return { error: "An active administrator studio membership is required." };
  }

  const studioId = memberships[0].studio_id;

  const project = parsed.data;
  const { error: insertError } = await supabase.from("projects").insert({
    studio_id: studioId,
    created_by: userId,
    name: project.name,
    project_code: project.project_code || null,
    client_name: project.client_name || null,
    description: project.description || null,
    total_area_m2: project.total_area_m2,
    status: project.status,
    priority: project.priority,
    start_date: project.start_date,
    due_date: project.due_date || null,
  });

  if (insertError) {
    console.error("Unable to create project", insertError);
    return { error: "The project could not be created. Please try again." };
  }

  redirect("/projects");
}
