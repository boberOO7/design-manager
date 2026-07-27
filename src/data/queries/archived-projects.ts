import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

export type ArchivedProject = Pick<
  ProjectRow,
  | "id"
  | "studio_id"
  | "name"
  | "project_code"
  | "client_name"
  | "description"
  | "status"
  | "archived_at"
  | "completed_at"
  | "updated_at"
>;

type ArchivedProjectsResult =
  | { projects: ArchivedProject[]; error: null }
  | { projects: null; error: "query_failed" };

export async function getArchivedProjects(): Promise<ArchivedProjectsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, studio_id, name, project_code, client_name, description, status, archived_at, completed_at, updated_at",
    )
    .or("archived_at.not.is.null,status.eq.archived")
    .order("archived_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error || !data) {
    console.error("Unable to load archived projects", error);
    return { projects: null, error: "query_failed" };
  }

  return { projects: data, error: null };
}
