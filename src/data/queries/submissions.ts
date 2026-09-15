import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import type { SubmissionPriority, SubmissionRequestCategory, SubmissionStatus, SubmissionType } from "@/lib/submissions";

export type SubmissionPerson = { id: string; fullName: string; avatarUrl: string | null };
export type SubmissionComment = { id: string; body: string; createdAt: string; author: SubmissionPerson };
export type SubmissionSummary = {
  id: string;
  studioId: string;
  type: SubmissionType;
  requestCategory: SubmissionRequestCategory | null;
  title: string;
  status: SubmissionStatus;
  author: SubmissionPerson | null;
  isAnonymous: boolean;
  responsible: SubmissionPerson | null;
  priority: SubmissionPriority;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  supportCount: number;
  supportedByMe: boolean;
};

export type SubmissionDetail = { description: string; comments: SubmissionComment[]; internalNote: string | null };
export type SubmissionItem = SubmissionSummary & SubmissionDetail;

type SubmissionRow = {
  id: string; studio_id: string; type: SubmissionType; request_category: SubmissionRequestCategory | null; title: string;
  status: SubmissionStatus; is_anonymous: boolean; priority: SubmissionPriority;
  deadline: string | null; created_at: string; updated_at: string;
  author: { id: string; full_name: string; avatar_url: string | null } | null;
  support: { count: number }[]; own_support: { count: number }[];
  responsible: { profile: { id: string; full_name: string; avatar_url: string | null } } | null;
};
type CommentRow = { id: string; submission_id: string; body: string; created_at: string; author: { id: string; full_name: string; avatar_url: string | null } };

function person(profile: { id: string; full_name: string; avatar_url: string | null }): SubmissionPerson {
  return { id: profile.id, fullName: profile.full_name, avatarUrl: profile.avatar_url };
}

export async function getSubmissionsData(): Promise<{ items: SubmissionSummary[]; currentUserId: string; isAdmin: boolean; members: SubmissionPerson[] }> {
  const membership = await getActiveStudioMembership();
  if (!membership) throw new Error("An active studio membership is required to load submissions.");
  const supabase = await createClient();
  const [itemsResult, membersResult] = await Promise.all([
    supabase.from("submissions").select("id, studio_id, type, request_category, title, status, is_anonymous, priority, deadline, created_at, updated_at, author:profiles!submissions_author_id_fkey(id, full_name, avatar_url), responsible:studio_members!submissions_studio_id_responsible_id_fkey(profile:profiles!studio_members_user_id_fkey(id, full_name, avatar_url)), support:submission_reactions(count), own_support:submission_reactions(count)").eq("studio_id", membership.studio_id).eq("own_support.user_id", membership.authenticatedUserId).order("created_at", { ascending: false }).overrideTypes<SubmissionRow[], { merge: false }>(),
    supabase.from("studio_members").select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, avatar_url)").eq("studio_id", membership.studio_id).eq("is_active", true).overrideTypes<{ profile: { id: string; full_name: string; avatar_url: string | null } }[], { merge: false }>(),
  ]);
  const failure = itemsResult.error ?? membersResult.error;
  if (failure) throw new Error("Unable to load submissions.", { cause: failure });
  return {
    currentUserId: membership.authenticatedUserId,
    isAdmin: membership.system_role === "admin",
    members: (membersResult.data ?? []).map((row) => person(row.profile)).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    items: (itemsResult.data ?? []).map((row) => ({
      id: row.id, studioId: row.studio_id, type: row.type, requestCategory: row.request_category, title: row.title,
      status: row.status, author: row.author ? person(row.author) : null, isAnonymous: row.is_anonymous,
      responsible: row.responsible ? person(row.responsible.profile) : null, priority: row.priority,
      deadline: row.deadline, createdAt: row.created_at, updatedAt: row.updated_at,
      supportCount: row.support[0]?.count ?? 0, supportedByMe: (row.own_support[0]?.count ?? 0) > 0,
    })),
  };
}

export async function getSubmissionDetail(submissionId: string): Promise<SubmissionDetail | null> {
  const membership = await getActiveStudioMembership();
  if (!membership) return null;
  const supabase = await createClient();
  const { data: item, error } = await supabase.from("submissions").select("description, is_anonymous")
    .eq("studio_id", membership.studio_id).eq("id", submissionId).maybeSingle();
  if (error) throw new Error("Unable to load submission detail.", { cause: error });
  if (!item) return null;
  const [comments, note] = await Promise.all([
    item.is_anonymous ? Promise.resolve([]) : getSubmissionComments(submissionId, membership.studio_id),
    membership.system_role === "admin"
      ? supabase.from("submission_admin_details").select("internal_note").eq("studio_id", membership.studio_id).eq("submission_id", submissionId).maybeSingle().throwOnError()
      : Promise.resolve({ data: null }),
  ]);
  return { description: item.description, comments, internalNote: note.data?.internal_note ?? null };
}

async function getSubmissionComments(submissionId: string, studioId: string): Promise<SubmissionComment[]> {
  const supabase = await createClient();
  const comments: SubmissionComment[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("submission_comments")
      .select("id, submission_id, body, created_at, author:profiles!submission_comments_author_id_fkey!inner(id, full_name, avatar_url)")
      .eq("studio_id", studioId).eq("submission_id", submissionId)
      .order("created_at").order("id").range(offset, offset + pageSize - 1)
      .overrideTypes<CommentRow[], { merge: false }>();
    if (error) throw new Error("Unable to load submission discussion.", { cause: error });
    comments.push(...(data ?? []).map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at, author: person(row.author) })));
    if (!data || data.length < pageSize) return comments;
  }
}
