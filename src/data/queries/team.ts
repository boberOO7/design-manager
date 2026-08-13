import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { SystemRole } from "@/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type StudioMemberRow = Database["public"]["Tables"]["studio_members"]["Row"];
type DirectoryRow = Pick<StudioMemberRow, "is_active" | "removed_at" | "system_role"> & { profile: ProfileRow };

export type TeamMember = Pick<StudioMemberRow, "is_active" | "removed_at"> &
  Pick<ProfileRow, "id" | "full_name" | "job_title" | "avatar_url" | "country_code" | "city" | "city_geonames_id"> & {
    system_role: SystemRole;
  };

export async function getCurrentStudioTeam(includeFormer = false): Promise<TeamMember[]> {
  const membership = await getActiveStudioMembership();
  if (!membership) throw new Error("Unable to load the Team because no single active studio membership was found.");

  const supabase = await createClient();
  let query = supabase.from("studio_members")
    .select("is_active, removed_at, system_role, profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url, country_code, city, city_geonames_id)")
    .eq("studio_id", membership.studio_id);
  if (!includeFormer) query = query.eq("is_active", true);
  const { data, error } = await query.overrideTypes<DirectoryRow[], { merge: false }>();
  if (error || !data) throw new Error("Unable to load the studio directory.", { cause: error });

  return data.map((member): TeamMember => {
    if (member.system_role !== "admin" && member.system_role !== "employee") throw new Error("The Team contains a membership with an unsupported system role.");
    return { ...member.profile, system_role: member.system_role, is_active: member.is_active, removed_at: member.removed_at };
  }).sort((left, right) => {
    if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
    if (left.system_role !== right.system_role) return left.system_role === "admin" ? -1 : 1;
    return left.full_name.localeCompare(right.full_name);
  });
}
