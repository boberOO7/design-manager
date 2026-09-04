import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import type { OfficeAssignmentPriority, OfficeAssignmentStatus } from "@/lib/office-assignments";
import type { SubmissionPerson } from "@/data/queries/submissions";

export type OfficeAssignmentItem = {
  id: string;
  studioId: string;
  title: string;
  description: string | null;
  creator: SubmissionPerson;
  responsible: SubmissionPerson;
  priority: OfficeAssignmentPriority;
  deadline: string | null;
  status: OfficeAssignmentStatus;
  createdAt: string;
  updatedAt: string;
};

type AssignmentRow = {
  id: string; studio_id: string; title: string; description: string | null;
  priority: OfficeAssignmentPriority; deadline: string | null; status: OfficeAssignmentStatus;
  created_at: string; updated_at: string;
  creator: { profile: { id: string; full_name: string; avatar_url: string | null } };
  responsible: { profile: { id: string; full_name: string; avatar_url: string | null } };
};

const toPerson = (row: { id: string; full_name: string; avatar_url: string | null }): SubmissionPerson => ({ id: row.id, fullName: row.full_name, avatarUrl: row.avatar_url });

export async function getOfficeAssignmentsData(): Promise<{ items: OfficeAssignmentItem[]; currentUserId: string; isAdmin: boolean; members: SubmissionPerson[] }> {
  const membership = await getActiveStudioMembership();
  if (!membership) throw new Error("An active studio membership is required to load office assignments.");
  const supabase = await createClient();
  const [itemsResult, membersResult] = await Promise.all([
    supabase.from("office_assignments").select("id, studio_id, title, description, priority, deadline, status, created_at, updated_at, creator:studio_members!office_assignments_studio_id_creator_id_fkey(profile:profiles!studio_members_user_id_fkey(id, full_name, avatar_url)), responsible:studio_members!office_assignments_studio_id_responsible_id_fkey(profile:profiles!studio_members_user_id_fkey(id, full_name, avatar_url))").eq("studio_id", membership.studio_id).order("created_at", { ascending: false }).overrideTypes<AssignmentRow[], { merge: false }>(),
    supabase.from("studio_members").select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, avatar_url)").eq("studio_id", membership.studio_id).eq("is_active", true).overrideTypes<{ profile: { id: string; full_name: string; avatar_url: string | null } }[], { merge: false }>(),
  ]);
  const failure = itemsResult.error ?? membersResult.error;
  if (failure) throw new Error("Unable to load office assignments.", { cause: failure });
  return {
    currentUserId: membership.authenticatedUserId,
    isAdmin: membership.system_role === "admin",
    members: (membersResult.data ?? []).map((row) => toPerson(row.profile)).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    items: (itemsResult.data ?? []).map((row) => ({
      id: row.id, studioId: row.studio_id, title: row.title, description: row.description,
      creator: toPerson(row.creator.profile), responsible: toPerson(row.responsible.profile),
      priority: row.priority, deadline: row.deadline, status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at,
    })),
  };
}
