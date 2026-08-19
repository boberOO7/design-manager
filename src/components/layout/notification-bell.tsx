"use client";

import { Bell, CalendarDays, CheckSquare, Clock3, X } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Drawer } from "@/components/ui/drawer";
import { ShellControl } from "@/components/layout/shell-control";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { NotificationData, NotificationItem } from "@/data/queries/notifications";
import { markAllNotificationsRead, markNotificationRead, unreadNotificationCount } from "@/lib/notifications";

function iconFor(type: NotificationItem["notification_type"]) {
  return type.startsWith("task_") ? CheckSquare : type.startsWith("calendar_") ? CalendarDays : Clock3;
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
function calendarMetadata(item: NotificationItem): { eventTitle: string; organizerName: string } | null {
  if (typeof item.metadata !== "object" || item.metadata === null || Array.isArray(item.metadata)) return null;
  return {
    eventTitle: typeof item.metadata.eventTitle === "string" ? item.metadata.eventTitle : item.title,
    organizerName: typeof item.metadata.organizerName === "string" ? item.metadata.organizerName : item.actorName ?? "",
  };
}

export function NotificationBell({ initialData }: { initialData: NotificationData }) {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const [items, setItems] = useState(initialData.items);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pending, setPending] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const unread = unreadNotificationCount(items);
  const visible = filter === "unread" ? items.filter((item) => item.read_at === null) : items;
  function presentation(item: NotificationItem) {
    const metadata = calendarMetadata(item);
    if (!metadata) return { title: item.title, body: item.body };
    if (item.notification_type === "calendar_event_invitation") return { title: t("calendarInvitationTitle"), body: t("calendarInvitationBody", { organizer: metadata.organizerName || item.actorName || "", title: metadata.eventTitle }) };
    if (item.notification_type === "calendar_event_updated") return { title: t("calendarEventUpdatedTitle"), body: t("calendarEventUpdatedBody", { title: metadata.eventTitle }) };
    if (item.notification_type === "calendar_event_cancelled") return { title: t("calendarEventCancelledTitle"), body: t("calendarEventCancelledBody", { title: metadata.eventTitle }) };
    return { title: item.title, body: item.body };
  }
  function requestClose() { if (!pending) setOpen(false); }
  async function readOne(item: NotificationItem) {
    if (item.read_at || pending) return true;
    const before = items; const at = new Date().toISOString(); setPending(item.id); setItems((current) => markNotificationRead(current, item.id, at));
    try {
      const response = await fetch(`/api/notifications/${item.id}/read`, { method: "PATCH" });
      if (!response.ok) throw new Error("failed");
      return true;
    } catch { setItems(before); return false; } finally { setPending(null); }
  }
  async function readAll() {
    if (!unread || pending) return;
    const before = items; setPending("all"); setItems((current) => markAllNotificationsRead(current, new Date().toISOString()));
    try { const response = await fetch("/api/notifications/read-all", { method: "POST" }); if (!response.ok) throw new Error("failed"); }
    catch { setItems(before); } finally { setPending(null); }
  }
  async function respondToInvite(item: NotificationItem, status: "accepted" | "declined") {
    const inviteId = typeof item.metadata === "object" && item.metadata !== null && !Array.isArray(item.metadata) && typeof item.metadata.inviteId === "string" ? item.metadata.inviteId : null;
    if (!inviteId || pending) return;
    setPending(item.id);
    try {
      const response = await fetch(`/api/calendar/invitations/${encodeURIComponent(inviteId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error("failed");
      setItems((current) => markNotificationRead(current, item.id, new Date().toISOString()));
      setOpen(false);
      router.push(`${item.href}${item.href.includes("?") ? "&" : "?"}refresh=${Date.now()}`);
    } finally { setPending(null); }
  }
  return <>
    <ShellControl ref={triggerRef} onClick={() => setOpen(true)} aria-expanded={open} aria-controls="notifications-drawer" aria-label={`Notifications, ${unread} unread`} className="relative size-11">
      <Bell size={16} />
      {unread ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[var(--ui-action-primary)] px-1 text-center text-[10px] font-bold leading-4 text-[var(--ui-action-primary-text)]">{unread > 99 ? "99+" : unread}</span> : null}
    </ShellControl>
    <Drawer isOpen={open} onClose={requestClose} returnFocusRef={triggerRef} initialFocusRef={closeRef} title="Notifications" className="w-[calc(100%-1rem)] max-w-md sm:w-full" >
      <div id="notifications-drawer" className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--ui-border)] p-5"><div><h2 className="font-semibold">Notifications</h2><p className="text-sm text-[var(--ui-text-muted)]">{unread} unread</p></div><button ref={closeRef} type="button" onClick={requestClose} className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-[var(--ui-surface-muted)]" aria-label="Close notifications"><X size={18}/></button></header>
        <div className="flex items-center justify-between border-b border-[var(--ui-border-subtle)] px-5 py-3"><SegmentedControl ariaLabel="Notification filter" items={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }]} value={filter} onValueChange={setFilter} /><button type="button" disabled={!unread || pending !== null} aria-busy={pending === "all"} onClick={() => void readAll()} className="text-sm font-medium text-[var(--ui-text-secondary)] disabled:text-[var(--ui-text-subtle)]">Mark all as read</button></div>
        <div className="flex-1 overflow-y-auto">{visible.length ? visible.map((item) => { const Icon = iconFor(item.notification_type); const inviteId = typeof item.metadata === "object" && item.metadata !== null && !Array.isArray(item.metadata) && typeof item.metadata.inviteId === "string" ? item.metadata.inviteId : null; const copy = presentation(item); return <div key={item.id} className={`border-b border-[var(--ui-border-subtle)] ${item.read_at ? "" : "bg-[var(--ui-surface-muted)]"}`}><button type="button" disabled={pending !== null} onClick={async () => { if (await readOne(item)) { setOpen(false); router.push(item.href); } }} className="flex w-full gap-3 p-5 text-left hover:bg-[var(--ui-surface-subtle)]"><Icon className="mt-0.5 size-4 text-[var(--ui-text-muted)]"/><span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><strong className="text-sm text-[var(--ui-text)]">{copy.title}</strong><time className="shrink-0 text-xs text-[var(--ui-text-muted)]">{relativeTime(item.created_at)}</time></span><span className="mt-1 block text-sm leading-5 text-[var(--ui-text-secondary)]">{copy.body}</span></span>{item.read_at ? null : <span className="mt-2 size-2 rounded-full bg-[var(--ui-action-primary)]"/>}</button>{item.notification_type === "calendar_event_invitation" && inviteId && !item.read_at ? <div className="flex gap-2 px-5 pb-4"><button type="button" disabled={pending !== null} onClick={() => void respondToInvite(item, "accepted")} className="min-h-9 rounded-lg bg-[var(--ui-action-primary)] px-3 text-sm font-medium text-[var(--ui-action-primary-text)] disabled:opacity-60">{t("accept")}</button><button type="button" disabled={pending !== null} onClick={() => void respondToInvite(item, "declined")} className="min-h-9 rounded-lg border border-[var(--ui-border)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] disabled:opacity-60">{t("decline")}</button></div> : null}</div>; }) : <p className="p-8 text-center text-sm text-[var(--ui-text-muted)]">{filter === "unread" ? "You’re all caught up." : "No notifications yet."}</p>}</div>
      </div>
    </Drawer>
  </>;
}
