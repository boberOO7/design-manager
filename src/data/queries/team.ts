import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { SystemRole } from "@/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type StudioMemberRow = Database["public"]["Tables"]["studio_members"]["Row"];

export type TeamMember = Pick<StudioMemberRow, "is_active"> &
  Pick<ProfileRow, "id" | "full_name" | "job_title" | "avatar_url" | "country_code" | "city" | "city_geonames_id"> & {
    system_role: SystemRole;
  };

export async function getCurrentStudioTeam(): Promise<TeamMember[]> {
  const membership = await getActiveStudioMembership();

  if (!membership) {
    throw new Error("Unable to load the Team because no single active studio membership was found.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("studio_members")
    .select(
      "is_active, system_role, profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url, country_code, city, city_geonames_id)",
    )
    .eq("studio_id", membership.studio_id)
    .eq("is_active", true);

  if (error || !data) {
    throw new Error("Unable to load active studio members for the Team page.", {
      cause: error,
    });
  }

  const team = data.map((member): TeamMember => {
    if (member.system_role !== "admin" && member.system_role !== "employee") {
      throw new Error("The Team contains a membership with an unsupported system role.");
    }

    return {
      id: member.profile.id,
      full_name: member.profile.full_name,
      job_title: member.profile.job_title,
      avatar_url: member.profile.avatar_url,
      country_code: member.profile.country_code,
      city: member.profile.city,
      city_geonames_id: member.profile.city_geonames_id,
      system_role: member.system_role,
      is_active: member.is_active,
    };
  });

  return team.sort((left, right) => {
    if (left.system_role !== right.system_role) {
      return left.system_role === "admin" ? -1 : 1;
    }

    return left.full_name.localeCompare(right.full_name);
  });
}
