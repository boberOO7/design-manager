"use client";

import { Bell, Building2, CalendarDays, CheckSquare, Clock3, MessagesSquare, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ShellControl } from "@/components/layout/shell-control";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { NotificationData, NotificationItem } from "@/data/queries/notifications";
import { addRealtimeToast, dismissRealtimeToast, getRealtimeNotificationCatchup, getRealtimeNotificationDelivery, markAllNotificationsRead, markNotificationRead, mergeNotifications, notificationCursorFilter, notificationPageSize, oldestNotificationCursor, reconcileNotificationUnreadCount, restoreNotificationReadState, type NotificationCursor, type NotificationUnreadChange, notificationFromRealtimeRow, unreadNotificationCount } from "@/lib/notifications";
import { formatNotificationRelativeTime, getNotificationPresentation } from "@/lib/notification-presentation";
import { createClient } from "@/lib/supabase/client";
import { getCalendarInvitationErrorKey } from "@/lib/calendar-invitation-error";
import type { Database } from "@/types/database.types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

function readAtFromResponse(result: unknown) {
  if (typeof result !== "object" || result === null) return null;
  if ("readAt" in result && typeof result.readAt === "string") return result.readAt;
  return "notification" in result && typeof result.notification === "object" && result.notification !== null
    && "read_at" in result.notification && typeof result.notification.read_at === "string" ? result.notification.read_at : null;
}

function iconFor(type: NotificationItem["notification_type"]) {
  return type.startsWith("task_") ? CheckSquare : type.startsWith("calendar_") ? CalendarDays : type.startsWith("submission_") ? MessagesSquare : type.startsWith("office_assignment_") ? Building2 : type.startsWith("equipment_") ? Wrench : Clock3;
}

function notificationIcon(type: NotificationItem["notification_type"]) {
  const className = "size-4";
  return type.startsWith("task_") ? <CheckSquare aria-hidden="true" className={className} /> : type.startsWith("calendar_") ? <CalendarDays aria-hidden="true" className={className} /> : type.startsWith("submission_") ? <MessagesSquare aria-hidden="true" className={className} /> : type.startsWith("office_assignment_") ? <Building2 aria-hidden="true" className={className} /> : type.startsWith("equipment_") ? <Wrench aria-hidden="true" className={className} /> : <Clock3 aria-hidden="true" className={className} />;
}

function playNotificationSound() {
  try {
    const context = new AudioContext();
    void context.resume().then(() => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      oscillator.connect(gain).connect(context.destination);
      oscillator.addEventListener("ended", () => { void context.close(); }, { once: true });
      oscillator.start(now);
      oscillator.stop(now + 0.14);
    }).catch(() => { void context.close(); });
  } catch {
    // Browser audio policy and device failures must never block notification delivery.
  }
}

function RealtimeNotificationToast({ item, onDismiss }: { item: NotificationItem; onDismiss: (id: string) => void }) {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const [closing, setClosing] = useState(false);
  const copy = getNotificationPresentation(item, locale, (key, values) => t(key, values));
  const startDismiss = useCallback(() => setClosing(true), []);

  useEffect(() => {
    const timeout = window.setTimeout(startDismiss, 5000);
    return () => window.clearTimeout(timeout);
  }, [startDismiss]);

  useEffect(() => {
    if (!closing) return;
    const timeout = window.setTimeout(() => onDismiss(item.id), 160);
    return () => window.clearTimeout(timeout);
  }, [closing, item.id, onDismiss]);

  return <li className={`notification-toast relative overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-popover)] ${closing ? "notification-toast--closing" : ""}`}>
    <Link href={item.href} onClick={() => onDismiss(item.id)} className="flex min-h-20 gap-3 py-4 pl-4 pr-14 transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)]">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]">{notificationIcon(item.notification_type)}</span>
      <span className="min-w-0"><strong className="block text-sm text-[var(--ui-text)]">{copy.title}</strong><span className="mt-1 block text-sm leading-5 text-[var(--ui-text-secondary)]">{copy.body}</span></span>
    </Link>
    <button type="button" onClick={startDismiss} aria-label={t("dismissToast", { title: copy.title })} className="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X aria-hidden="true" className="size-4" /></button>
  </li>;
}

export function NotificationBell({ initialData, popupsEnabled, soundEnabled, userId }: { initialData: NotificationData; popupsEnabled: boolean; soundEnabled: boolean; userId: string }) {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(initialData.items);
  const [unread, setUnread] = useState(initialData.unreadCount);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const [pending, setPending] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [allCursor, setAllCursor] = useState<NotificationCursor | null>(() => oldestNotificationCursor(initialData.items));
  const [unreadCursor, setUnreadCursor] = useState<NotificationCursor | null>(() => oldestNotificationCursor(initialData.items));
  const [hasMoreAll, setHasMoreAll] = useState(initialData.items.length === notificationPageSize);
  const [hasMoreUnread, setHasMoreUnread] = useState(initialData.unreadCount > unreadNotificationCount(initialData.items));
  const [invitationError, setInvitationError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sessionStartedAtRef = useRef(initialData.realtimeStartedAt);
  const knownIdsRef = useRef(new Set(initialData.items.map((item) => item.id)));
  const snapshotAtRef = useRef(initialData.realtimeStartedAt);
  const unreadBaseRef = useRef(initialData.unreadCount);
  const unreadChangesRef = useRef<NotificationUnreadChange[]>([]);
  const retainLoadedHistoryRef = useRef(false);
  const loadRequestRef = useRef(0);
  const currentUserIdRef = useRef(userId);
  const preferencesRef = useRef({ popupsEnabled, soundEnabled });
  const visible = filter === "unread" ? items.filter((item) => item.read_at === null) : items;
  function recordUnreadChange(change: NotificationUnreadChange) {
    const reconciled = reconcileNotificationUnreadCount(unreadBaseRef.current, snapshotAtRef.current, [...unreadChangesRef.current, change]);
    unreadChangesRef.current = reconciled.pending;
    setUnread(reconciled.unreadCount);
  }
  const dismissToast = useCallback((id: string) => setToasts((current) => dismissRealtimeToast(current, id)), []);

  useEffect(() => {
    preferencesRef.current = { popupsEnabled, soundEnabled };
  }, [popupsEnabled, soundEnabled]);

  useEffect(() => {
    const changedUser = currentUserIdRef.current !== userId;
    currentUserIdRef.current = userId;
    if (changedUser) {
      unreadChangesRef.current = [];
      retainLoadedHistoryRef.current = false;
      knownIdsRef.current = new Set();
      sessionStartedAtRef.current = initialData.realtimeStartedAt;
      setToasts([]);
      setOpen(false);
    }
    const reconciled = reconcileNotificationUnreadCount(initialData.unreadCount, initialData.realtimeStartedAt, unreadChangesRef.current);
    snapshotAtRef.current = initialData.realtimeStartedAt;
    unreadBaseRef.current = initialData.unreadCount;
    unreadChangesRef.current = reconciled.pending;
    for (const item of initialData.items) knownIdsRef.current.add(item.id);
    setItems((current) => changedUser ? initialData.items : mergeNotifications(current, initialData.items, retainLoadedHistoryRef.current ? Number.POSITIVE_INFINITY : notificationPageSize));
    setUnread(reconciled.unreadCount);
    const combinedItems = changedUser ? initialData.items : mergeNotifications(items, initialData.items, Number.POSITIVE_INFINITY);
    setHasMoreUnread(reconciled.unreadCount > unreadNotificationCount(combinedItems));
    if (!retainLoadedHistoryRef.current) {
      const cursor = oldestNotificationCursor(initialData.items);
      setAllCursor(cursor);
      setUnreadCursor(cursor);
      setHasMoreAll(initialData.items.length === notificationPageSize);
    }
  }, [initialData, userId]);

  useEffect(() => {
    const supabase = createClient();
    const processingIds = new Set<string>();
    let disposed = false;
    async function receive(item: NotificationItem) {
      const delivery = getRealtimeNotificationDelivery(item, sessionStartedAtRef.current, new Set([...knownIdsRef.current, ...processingIds]), preferencesRef.current);
      if (!delivery || disposed) return;
      processingIds.add(item.id);
      try {
        if (item.notification_type === "meta_lead_created" || item.notification_type === "crm_lead_follow_up" || item.notification_type.startsWith("equipment_maintenance_")) {
          const current = await supabase.rpc("is_notification_deliverable", { p_notification_id: item.id });
          if (disposed || current.error || !current.data) return;
        }
        if (disposed) return;
        knownIdsRef.current.add(item.id);
        retainLoadedHistoryRef.current = true;
        setItems((current) => mergeNotifications(current, [item], Number.POSITIVE_INFINITY));
        if (item.read_at === null) recordUnreadChange({ at: item.created_at, delta: 1 });
        if (delivery.showToast) setToasts((current) => addRealtimeToast(current, item));
        if (delivery.playSound) playNotificationSound();
      } finally {
        processingIds.delete(item.id);
      }
    }
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on<NotificationRow>("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, async (payload) => {
        const item = notificationFromRealtimeRow(payload.new, userId);
        if (!item) return;
        const delivery = getRealtimeNotificationDelivery(item, sessionStartedAtRef.current, knownIdsRef.current, preferencesRef.current);
        if (!delivery) return;
        await receive(item);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || disposed) return;
        // Reconcile inserts committed between the server snapshot and this subscription,
        // and after any Realtime reconnect. The watermark excludes older notifications.
        void (async () => {
          const through = new Date().toISOString();
          let cursor: NotificationCursor | null = null;
          while (!disposed) {
            let query = supabase.from("notifications")
              .select("id, recipient_id, notification_type, title, body, href, metadata, read_at, created_at")
              .eq("recipient_id", userId)
              .gt("created_at", sessionStartedAtRef.current)
              .lte("created_at", through)
              .is("read_at", null);
            if (cursor) query = query.or(notificationCursorFilter(cursor));
            const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(notificationPageSize);
            if (disposed || error) return;
            if (data?.length) retainLoadedHistoryRef.current = true;
            const pending = getRealtimeNotificationCatchup(data ?? [], userId, sessionStartedAtRef.current, knownIdsRef.current, processingIds, preferencesRef.current);
            for (const { item } of pending.reverse()) void receive(item);
            if ((data?.length ?? 0) < notificationPageSize) return;
            const last = data?.at(-1);
            if (!last) return;
            cursor = { id: last.id, created_at: last.created_at };
          }
        })().catch(() => {});
      });
    return () => { disposed = true; void supabase.removeChannel(channel); };
  }, [userId]);
  useEffect(() => () => { loadRequestRef.current += 1; }, [userId]);

  async function loadMore() {
    if (loadingMore) return;
    const isUnread = filter === "unread";
    const cursor = isUnread ? unreadCursor : allCursor;
    if (!cursor) return;
    const request = ++loadRequestRef.current;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const supabase = createClient();
      const selected = "id, notification_type, title, body, href, metadata, read_at, created_at, actor:profiles!notifications_actor_id_fkey(full_name)";
      const page = isUnread
        ? await supabase.from("notifications").select(selected).eq("recipient_id", userId).is("read_at", null).or(notificationCursorFilter(cursor)).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(notificationPageSize)
        : await supabase.from("notifications").select(selected).eq("recipient_id", userId).or(notificationCursorFilter(cursor)).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(notificationPageSize);
      if (request !== loadRequestRef.current) return;
      if (page.error) throw page.error;
      const next = (page.data ?? []).map((row) => ({ ...row, actorName: row.actor?.full_name ?? null }));
      if (next.length) {
        retainLoadedHistoryRef.current = true;
        setItems((current) => mergeNotifications(current, next, Number.POSITIVE_INFINITY));
        const nextCursor = oldestNotificationCursor(next);
        if (isUnread) setUnreadCursor(nextCursor);
        else setAllCursor(nextCursor);
      } else if (!isUnread) {
        setHasMoreAll(false);
      }
      if (!isUnread && next.length < notificationPageSize) setHasMoreAll(false);
      if (isUnread && next.length < notificationPageSize) setHasMoreUnread(false);
    } catch {
      if (request === loadRequestRef.current) setLoadMoreError(true);
    } finally {
      if (request === loadRequestRef.current) setLoadingMore(false);
    }
  }

  function openNotifications() {
    setInvitationError("");
    setFilter("unread");
    setOpen(true);
  }
  function requestClose() { if (!pending) setOpen(false); }
  async function readOne(item: NotificationItem) {
    if (item.read_at || pending) return true;
    const at = new Date().toISOString(); setPending(item.id); setItems((current) => markNotificationRead(current, item.id, at));
    try {
      const response = await fetch(`/api/notifications/${item.id}/read`, { method: "PATCH" });
      if (!response.ok) throw new Error("failed");
      const result: unknown = await response.json();
      const readAt = readAtFromResponse(result) ?? new Date().toISOString();
      recordUnreadChange({ at: readAt, delta: -1 });
      setItems((current) => markNotificationRead(current, item.id, readAt));
      return true;
    } catch { setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: item.read_at } : entry)); return false; } finally { setPending(null); }
  }
  async function readAll() {
    if (!unread || pending) return;
    const before = items; setPending("all"); setItems((current) => markAllNotificationsRead(current, new Date().toISOString()));
    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!response.ok) throw new Error("failed");
      const result: unknown = await response.json();
      const readAt = typeof result === "object" && result !== null && "readAt" in result && typeof result.readAt === "string" ? result.readAt : new Date().toISOString();
      recordUnreadChange({ at: readAt, reset: true });
      setItems((current) => markAllNotificationsRead(current, readAt));
    } catch { setItems((current) => restoreNotificationReadState(current, before)); } finally { setPending(null); }
  }
  async function respondToInvite(item: NotificationItem, status: "accepted" | "declined") {
    const inviteId = typeof item.metadata === "object" && item.metadata !== null && !Array.isArray(item.metadata) && typeof item.metadata.inviteId === "string" ? item.metadata.inviteId : null;
    if (!inviteId || pending) return;
    setInvitationError("");
    setPending(item.id);
    try {
      const response = await fetch(`/api/calendar/invitations/${encodeURIComponent(inviteId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) {
        const result: unknown = await response.json();
        setInvitationError(t(getCalendarInvitationErrorKey(result)));
        return;
      }
      if (item.read_at === null) {
        const readResponse = await fetch(`/api/notifications/${item.id}/read`, { method: "PATCH" });
        if (readResponse.ok) {
          const result: unknown = await readResponse.json();
          const readAt = readAtFromResponse(result) ?? new Date().toISOString();
          recordUnreadChange({ at: readAt, delta: -1 });
          setItems((current) => markNotificationRead(current, item.id, readAt));
        }
      }
      setOpen(false);
      router.push(`${item.href}${item.href.includes("?") ? "&" : "?"}refresh=${Date.now()}`);
    } catch { setInvitationError(t("invitationResponseFailed")); } finally { setPending(null); }
  }
  return <>
    <ShellControl ref={triggerRef} onClick={openNotifications} aria-expanded={open} aria-controls="notifications-drawer" aria-label={t("bellLabel", { count: unread })} className="relative size-11">
      <Bell size={16} />
      {unread ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[var(--ui-action-primary)] px-1 text-center text-[10px] font-bold leading-4 text-[var(--ui-action-primary-text)]">{unread > 99 ? "99+" : unread}</span> : null}
    </ShellControl>
    <Drawer isOpen={open} onClose={requestClose} returnFocusRef={triggerRef} initialFocusRef={closeRef} title={t("title")} className="w-[calc(100%-1rem)] max-w-md sm:w-full" >
      <div id="notifications-drawer" className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--ui-border)] p-5"><div><h2 className="font-semibold">{t("title")}</h2><p className="text-sm text-[var(--ui-text-muted)]">{t("unreadCount", { count: unread })}</p></div><button ref={closeRef} type="button" onClick={requestClose} className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-[var(--ui-surface-muted)]" aria-label={t("close")}><X size={18}/></button></header>
        <div className="flex items-center justify-between border-b border-[var(--ui-border-subtle)] px-5 py-3"><SegmentedControl ariaLabel={t("filterLabel")} items={[{ value: "unread", label: t("unread") }, { value: "all", label: t("all") }]} value={filter} onValueChange={setFilter} /><button type="button" disabled={!unread || pending !== null} aria-busy={pending === "all"} onClick={() => void readAll()} className="text-sm font-medium text-[var(--ui-text-secondary)] disabled:text-[var(--ui-text-subtle)]">{t("markAllAsRead")}</button></div>
        {invitationError ? <p role="alert" className="mx-5 my-3 rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{invitationError}</p> : null}
        <div className="flex-1 overflow-y-auto">{visible.length ? visible.map((item) => { const Icon = iconFor(item.notification_type); const inviteId = typeof item.metadata === "object" && item.metadata !== null && !Array.isArray(item.metadata) && typeof item.metadata.inviteId === "string" ? item.metadata.inviteId : null; const copy = getNotificationPresentation(item, locale, (key, values) => t(key, values)); return <div key={item.id} className={`border-b border-[var(--ui-border-subtle)] ${item.read_at ? "" : "bg-[var(--ui-surface-muted)]"}`}><button type="button" disabled={pending !== null} onClick={async () => { if (await readOne(item)) { setOpen(false); router.push(item.href); } }} className="flex w-full gap-3 p-5 text-left hover:bg-[var(--ui-surface-subtle)]"><Icon className="mt-0.5 size-4 text-[var(--ui-text-muted)]"/><span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><strong className="text-sm text-[var(--ui-text)]">{copy.title}</strong><time className="shrink-0 text-xs text-[var(--ui-text-muted)]" dateTime={item.created_at}>{formatNotificationRelativeTime(item.created_at, locale)}</time></span><span className="mt-1 block text-sm leading-5 text-[var(--ui-text-secondary)]">{copy.body}</span></span>{item.read_at ? null : <span className="mt-2 size-2 rounded-full bg-[var(--ui-action-primary)]"/>}</button>{item.notification_type === "calendar_event_invitation" && inviteId && !item.read_at ? <div className="flex gap-2 px-5 pb-4"><button type="button" disabled={pending !== null} onClick={() => void respondToInvite(item, "accepted")} className="min-h-9 rounded-lg bg-[var(--ui-action-primary)] px-3 text-sm font-medium text-[var(--ui-action-primary-text)] disabled:opacity-60">{t("accept")}</button><Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => void respondToInvite(item, "declined")} className="min-h-9 rounded-lg border-[var(--ui-border)] font-medium disabled:opacity-60">{t("decline")}</Button></div> : null}</div>; }) : <p className="p-8 text-center text-sm text-[var(--ui-text-muted)]">{filter === "unread" ? t("allCaughtUp") : t("noNotifications")}</p>}
          {((filter === "all" && hasMoreAll) || (filter === "unread" && hasMoreUnread && unread > items.filter((item) => item.read_at === null).length)) ? <div className="border-t border-[var(--ui-border-subtle)] p-4 text-center">
            {loadMoreError ? <p role="alert" className="mb-2 text-sm text-[var(--ui-danger-text)]">{t("loadMoreFailed")}</p> : null}
            <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-10 rounded-lg border-[var(--ui-border)] font-medium disabled:opacity-60">
              {loadingMore ? t("loadingMore") : t("loadMore")}
            </Button>
          </div> : null}
        </div>
      </div>
    </Drawer>
    {toasts.length ? <ol aria-label={t("realtimeRegionLabel")} aria-live="polite" aria-relevant="additions" className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex flex-col gap-2 sm:left-auto sm:w-96">{toasts.map((item) => <RealtimeNotificationToast item={item} key={item.id} onDismiss={dismissToast} />)}</ol> : null}
  </>;
}
