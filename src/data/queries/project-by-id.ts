import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type ProjectDetails = Database["public"]["Tables"]["projects"]["Row"];

/**
 * Reads a single project through the authenticated user's RLS scope.
 * A missing row also covers projects the current user is not allowed to see.
 */
export async function getProjectById(projectId: string): Promise<ProjectDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, studio_id, name, project_code, project_type, project_type_custom, country_code, city, city_geonames_id, client_name, description, total_area_m2, status, priority, start_date, due_date, completed_at, archived_at, created_by, created_at, updated_at",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error("Unable to load project", error);
    return null;
  }

  return data;
}
