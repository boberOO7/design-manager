import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import type { SubmissionPriority, SubmissionStatus, SubmissionType } from "@/lib/submissions";

export type SubmissionPerson = { id: string; fullName: string; avatarUrl: string | null };
export type SubmissionComment = { id: string; body: string; createdAt: string; author: SubmissionPerson };
export type SubmissionItem = {
  id: string;
  studioId: string;
  type: SubmissionType;
  title: string;
  description: string;
  status: SubmissionStatus;
  author: SubmissionPerson | null;
  isAnonymous: boolean;
  responsible: SubmissionPerson | null;
  priority: SubmissionPriority;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  comments: SubmissionComment[];
  supportCount: number;
  supportedByMe: boolean;
  internalNote: string | null;
};

type SubmissionRow = {
  id: string; studio_id: string; type: SubmissionType; title: string; description: string;
  status: SubmissionStatus; is_anonymous: boolean; priority: SubmissionPriority;
  deadline: string | null; created_at: string; updated_at: string;
  author: { id: string; full_name: string; avatar_url: string | null } | null;
  responsible: { profile: { id: string; full_name: string; avatar_url: string | null } } | null;
};
type CommentRow = { id: string; submission_id: string; body: string; created_at: string; author: { id: string; full_name: string; avatar_url: string | null } };

function person(profile: { id: string; full_name: string; avatar_url: string | null }): SubmissionPerson {
  return { id: profile.id, fullName: profile.full_name, avatarUrl: profile.avatar_url };
}

export async function getSubmissionsData(): Promise<{ items: SubmissionItem[]; currentUserId: string; isAdmin: boolean; members: SubmissionPerson[] }> {
  const membership = await getActiveStudioMembership();
  if (!membership) throw new Error("An active studio membership is required to load submissions.");
  const supabase = await createClient();
  const [itemsResult, commentsResult, reactionsResult, detailsResult, membersResult] = await Promise.all([
    supabase.from("submissions").select("id, studio_id, type, title, description, status, is_anonymous, priority, deadline, created_at, updated_at, author:profiles!submissions_author_id_fkey(id, full_name, avatar_url), responsible:studio_members!submissions_studio_id_responsible_id_fkey(profile:profiles!studio_members_user_id_fkey(id, full_name, avatar_url))").eq("studio_id", membership.studio_id).order("created_at", { ascending: false }).overrideTypes<SubmissionRow[], { merge: false }>(),
    supabase.from("submission_comments").select("id, submission_id, body, created_at, author:profiles!submission_comments_author_id_fkey!inner(id, full_name, avatar_url)").eq("studio_id", membership.studio_id).order("created_at").overrideTypes<CommentRow[], { merge: false }>(),
    supabase.from("submission_reactions").select("submission_id, user_id").eq("studio_id", membership.studio_id),
    supabase.from("submission_admin_details").select("submission_id, internal_note").eq("studio_id", membership.studio_id),
    supabase.from("studio_members").select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, avatar_url)").eq("studio_id", membership.studio_id).eq("is_active", true).overrideTypes<{ profile: { id: string; full_name: string; avatar_url: string | null } }[], { merge: false }>(),
  ]);
  const failure = itemsResult.error ?? commentsResult.error ?? reactionsResult.error ?? membersResult.error;
  if (failure) throw new Error("Unable to load submissions.", { cause: failure });
  if (detailsResult.error && membership.system_role === "admin") throw new Error("Unable to load submission administration details.", { cause: detailsResult.error });

  const comments = new Map<string, SubmissionComment[]>();
  for (const row of commentsResult.data ?? []) {
    const values = comments.get(row.submission_id) ?? [];
    values.push({ id: row.id, body: row.body, createdAt: row.created_at, author: person(row.author) });
    comments.set(row.submission_id, values);
  }
  const support = new Map<string, { count: number; mine: boolean }>();
  for (const row of reactionsResult.data ?? []) {
    const value = support.get(row.submission_id) ?? { count: 0, mine: false };
    value.count += 1;
    value.mine ||= row.user_id === membership.authenticatedUserId;
    support.set(row.submission_id, value);
  }
  const notes = new Map((detailsResult.data ?? []).map((row) => [row.submission_id, row.internal_note]));
  return {
    currentUserId: membership.authenticatedUserId,
    isAdmin: membership.system_role === "admin",
    members: (membersResult.data ?? []).map((row) => person(row.profile)).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    items: (itemsResult.data ?? []).map((row) => ({
      id: row.id, studioId: row.studio_id, type: row.type, title: row.title, description: row.description,
      status: row.status, author: row.author ? person(row.author) : null, isAnonymous: row.is_anonymous,
      responsible: row.responsible ? person(row.responsible.profile) : null, priority: row.priority,
      deadline: row.deadline, createdAt: row.created_at, updatedAt: row.updated_at,
      comments: comments.get(row.id) ?? [], supportCount: support.get(row.id)?.count ?? 0,
      supportedByMe: support.get(row.id)?.mine ?? false, internalNote: notes.get(row.id) ?? null,
    })),
  };
}
