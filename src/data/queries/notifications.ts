import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export type NotificationItem = Pick<NotificationRow, "id" | "notification_type" | "title" | "body" | "href" | "metadata" | "read_at" | "created_at"> & {
  actorName: string | null;
};

export type NotificationData = { items: NotificationItem[]; unreadCount: number; realtimeStartedAt: string };

export async function getNotificationData(): Promise<NotificationData> {
  const realtimeStartedAt = new Date().toISOString();
  const membership = await getActiveStudioMembership();
  if (!membership) return { items: [], unreadCount: 0, realtimeStartedAt };
  const supabase = await createClient();
  const [itemsResult, unreadResult] = await Promise.all([
    supabase.from("notifications").select("id, notification_type, title, body, href, metadata, read_at, created_at, actor:profiles!notifications_actor_id_fkey(full_name)").eq("recipient_id", membership.authenticatedUserId).lte("created_at", realtimeStartedAt).order("created_at", { ascending: false }).limit(30),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", membership.authenticatedUserId).lte("created_at", realtimeStartedAt).is("read_at", null),
  ]);
  if (itemsResult.error || unreadResult.error) {
    console.error("Unable to load notifications", itemsResult.error ?? unreadResult.error);
    return { items: [], unreadCount: 0, realtimeStartedAt };
  }
  return {
    unreadCount: unreadResult.count ?? 0,
    realtimeStartedAt,
    items: (itemsResult.data ?? []).map((item) => ({ ...item, actorName: item.actor?.full_name ?? null })),
  };
}
