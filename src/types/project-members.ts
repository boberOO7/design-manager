import type { Database } from "@/types/database.types";

type ProjectMemberTable = Database["public"]["Tables"]["project_members"];

export type ProjectMemberRow = ProjectMemberTable["Row"];
export type ProjectMemberInsert = ProjectMemberTable["Insert"];
