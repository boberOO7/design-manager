import type { TaskCollaborator } from "@/types/tasks";

/**
 * The shape returned by the single embedded `task_collaborators` relation in
 * task loaders. Keeping the junction user id in the select makes the
 * participant identity explicit instead of depending on a nested join alias.
 */
export type TaskCollaboratorRelation = {
  user_id: string;
  profile: TaskCollaborator | null;
};

/** Converts Supabase's junction rows into the canonical task collaborator DTO. */
export function normalizeTaskCollaborators(
  rows: readonly TaskCollaboratorRelation[] | null | undefined,
): TaskCollaborator[] {
  const collaborators = new Map<string, TaskCollaborator>();

  for (const row of rows ?? []) {
    if (!row.profile) continue;
    collaborators.set(row.user_id, { ...row.profile, id: row.user_id });
  }

  return [...collaborators.values()];
}
