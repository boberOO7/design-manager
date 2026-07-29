"use client";

import { Bell, CalendarDays, CheckSquare, Clock3, X } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/drawer";
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

export function NotificationBell({ initialData }: { initialData: NotificationData }) {
  const router = useRouter();
  const [items, setItems] = useState(initialData.items);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pending, setPending] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const unread = unreadNotificationCount(items);
  const visible = filter === "unread" ? items.filter((item) => item.read_at === null) : items;
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
  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="notifications-drawer" aria-label={`Notifications, ${unread} unread`} className="relative inline-flex size-11 items-center justify-center rounded-full border border-stone-200 text-stone-600 hover:bg-stone-50">
      <Bell size={16} />
      {unread ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-stone-900 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
    <Drawer isOpen={open} onClose={requestClose} returnFocusRef={triggerRef} initialFocusRef={closeRef} title="Notifications" className="w-[calc(100%-1rem)] max-w-md sm:w-full" >
      <div id="notifications-drawer" className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-stone-200 p-5"><div><h2 className="font-semibold">Notifications</h2><p className="text-sm text-stone-500">{unread} unread</p></div><button ref={closeRef} type="button" onClick={requestClose} className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-stone-100" aria-label="Close notifications"><X size={18}/></button></header>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3"><SegmentedControl ariaLabel="Notification filter" items={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }]} value={filter} onValueChange={setFilter} /><button type="button" disabled={!unread || pending !== null} aria-busy={pending === "all"} onClick={() => void readAll()} className="text-sm font-medium text-stone-700 disabled:text-stone-400">Mark all as read</button></div>
        <div className="flex-1 overflow-y-auto">{visible.length ? visible.map((item) => { const Icon = iconFor(item.notification_type); return <button key={item.id} type="button" disabled={pending !== null} onClick={async () => { if (await readOne(item)) { setOpen(false); router.push(item.href); } }} className={`flex w-full gap-3 border-b border-stone-100 p-5 text-left hover:bg-stone-50 ${item.read_at ? "" : "bg-stone-100/70"}`}><Icon className="mt-0.5 size-4 text-stone-500"/><span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><strong className="text-sm text-stone-900">{item.title}</strong><time className="shrink-0 text-xs text-stone-500">{relativeTime(item.created_at)}</time></span><span className="mt-1 block text-sm leading-5 text-stone-600">{item.body}</span></span>{item.read_at ? null : <span className="mt-2 size-2 rounded-full bg-stone-900"/>}</button>; }) : <p className="p-8 text-center text-sm text-stone-500">{filter === "unread" ? "You’re all caught up." : "No notifications yet."}</p>}</div>
      </div>
    </Drawer>
  </>;
}
