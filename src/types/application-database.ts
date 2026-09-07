import type { Database } from "@/types/database.types";

type PublicSchema = Database["public"];

/**
 * RPCs introduced after the checked-in generated snapshot. Keep this narrow
 * bridge at the client boundary until the repository's broader local-schema
 * type drift can be regenerated without changing unrelated RPC contracts.
 */
type SelectedTaskBulkFunctions = {
  bulk_assign_selected_project_tasks: {
    Args: { p_assignee_id: string; p_project_id: string; p_stage: string; p_task_ids: string[] };
    Returns: { id: string }[];
  };
  bulk_set_project_task_deadline: {
    Args: { p_due_date: string; p_project_id: string; p_stage: string; p_target_status: string; p_task_ids: string[] };
    Returns: { id: string }[];
  };
};

export type ApplicationDatabase = Omit<Database, "public"> & {
  public: Omit<PublicSchema, "Functions"> & {
    Functions: PublicSchema["Functions"] & SelectedTaskBulkFunctions;
  };
};
