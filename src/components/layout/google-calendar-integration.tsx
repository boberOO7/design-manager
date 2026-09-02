"use client";

import { CalendarSync, LoaderCircle, Unplug } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ConnectionStatus =
  | { connected: false }
  | {
    connected: true;
    email: string;
    calendarName: string;
    requiresReconnect: boolean;
    lastSyncAt: string | null;
    lastSyncError: string | null;
  };

function isConnectionStatus(value: unknown): value is ConnectionStatus {
  if (!value || typeof value !== "object") return false;
  if (!("connected" in value) || typeof value.connected !== "boolean") return false;
  if (!value.connected) return true;
  return "email" in value && typeof value.email === "string"
    && "calendarName" in value && typeof value.calendarName === "string"
    && "requiresReconnect" in value && typeof value.requiresReconnect === "boolean"
    && "lastSyncAt" in value && (typeof value.lastSyncAt === "string" || value.lastSyncAt === null)
    && "lastSyncError" in value && (typeof value.lastSyncError === "string" || value.lastSyncError === null);
}

export function GoogleCalendarIntegration({ active, oauthResult }: { active: boolean; oauthResult: string | null }) {
  const t = useTranslations("Account");
  const locale = useLocale();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [action, setAction] = useState<"sync" | "disconnect" | null>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disconnectTriggerRef = useRef<HTMLButtonElement>(null);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google-calendar/status", { cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok || !isConnectionStatus(data)) throw new Error("Invalid connection status response.");
      setStatus(data);
    } catch {
      setError(t("googleCalendarStatusFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!active) return;
    const timeoutId = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [active, loadStatus]);

  const displayedMessage = message ?? (oauthResult === "connected" ? t("googleCalendarConnected") : null);
  const displayedError = error ?? (oauthResult && oauthResult !== "connected" ? t("googleCalendarConnectFailed") : null);

  async function syncNow() {
    setAction("sync");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google-calendar/sync", { method: "POST" });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object") {
        if (response.status === 409) setStatus((current) => current?.connected ? { ...current, requiresReconnect: true } : current);
        throw new Error("Sync failed.");
      }
      const inserted = "inserted" in data && typeof data.inserted === "number" ? data.inserted : 0;
      const updated = "updated" in data && typeof data.updated === "number" ? data.updated : 0;
      const removed = "removed" in data && typeof data.removed === "number" ? data.removed : 0;
      setMessage(t("googleCalendarSyncComplete", { inserted, updated, removed }));
      await loadStatus();
    } catch {
      setError(t("googleCalendarSyncFailed"));
    } finally {
      setAction(null);
    }
  }

  async function disconnect() {
    setAction("disconnect");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google-calendar/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Disconnect failed.");
      setStatus({ connected: false });
      setDisconnectDialogOpen(false);
      setMessage(t("googleCalendarDisconnected"));
    } catch {
      setError(t("googleCalendarDisconnectFailed"));
    } finally {
      setAction(null);
    }
  }

  return (
    <section aria-labelledby="google-calendar-heading" className="border-t border-[var(--ui-border-subtle)] pt-5">
      <div className="flex items-start gap-3">
        <CalendarSync aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-muted)]" />
        <div className="min-w-0 flex-1">
          <h3 id="google-calendar-heading" className="font-medium text-[var(--ui-text)]">{t("googleCalendar")}</h3>
          {isLoading && !status ? <p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("googleCalendarLoading")}</p> : null}
          {status?.connected ? (
            <div className="mt-2 min-w-0 space-y-1 text-sm">
              <p className="truncate text-[var(--ui-text-secondary)]">{status.email}</p>
              <p className="truncate text-[var(--ui-text-muted)]">{status.calendarName}</p>
              {status.lastSyncAt ? <p className="text-xs text-[var(--ui-text-muted)]">{t("googleCalendarLastSync", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(status.lastSyncAt)) })}</p> : null}
              {status.requiresReconnect ? <p className="text-sm text-[var(--ui-danger-text)]">{t("googleCalendarReconnectRequired")}</p> : null}
              {!status.requiresReconnect && status.lastSyncError ? <p className="text-sm text-[var(--ui-danger-text)]">{t("googleCalendarSyncFailed")}</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      {!isLoading && status && !status.connected ? (
        <div className="mt-4"><Button asChild size="sm"><a href="/api/integrations/google-calendar/connect">{t("connectGoogleCalendar")}</a></Button></div>
      ) : null}
      {status?.connected ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {status.requiresReconnect ? <Button asChild size="sm"><a href="/api/integrations/google-calendar/connect">{t("reconnectGoogleCalendar")}</a></Button> : <Button disabled={action !== null} onClick={() => void syncNow()} size="sm" type="button">{action === "sync" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <CalendarSync aria-hidden="true" className="size-3.5" />}{t("syncNow")}</Button>}
          <Button ref={disconnectTriggerRef} disabled={action !== null} onClick={() => { setMessage(null); setError(null); setDisconnectDialogOpen(true); }} size="sm" type="button" variant="outline"><Unplug aria-hidden="true" className="size-3.5" />{t("disconnectGoogleCalendar")}</Button>
        </div>
      ) : null}
      <div aria-live="polite">
        {displayedMessage ? <p className="mt-3 text-sm text-[var(--ui-success-text)]">{displayedMessage}</p> : null}
        {displayedError && !disconnectDialogOpen ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{displayedError}</p> : null}
      </div>
      <Dialog
        className="max-w-md"
        closeDisabled={action === "disconnect"}
        closeLabel={t("cancel")}
        description={status?.connected ? t("googleCalendarDisconnectDescription", { calendarName: status.calendarName }) : undefined}
        isOpen={disconnectDialogOpen && Boolean(status?.connected)}
        onRequestClose={() => { if (action !== "disconnect") setDisconnectDialogOpen(false); }}
        returnFocusRef={disconnectTriggerRef}
        title={t("googleCalendarDisconnectTitle")}
      >
        {error ? <div className="min-h-0 flex-1 px-4 py-3 sm:px-6"><p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p></div> : null}
        <footer className="flex shrink-0 justify-end gap-3 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6">
          <Button data-dialog-initial-focus disabled={action === "disconnect"} onClick={() => setDisconnectDialogOpen(false)} type="button" variant="outline">{t("cancel")}</Button>
          <Button className="bg-[var(--ui-action-danger)] text-[var(--ui-action-primary-text)] hover:opacity-90 disabled:bg-[var(--ui-surface-muted)] disabled:text-[var(--ui-text-muted)] disabled:!opacity-100" disabled={action === "disconnect"} onClick={() => void disconnect()} type="button">{action === "disconnect" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Unplug aria-hidden="true" className="size-4" />}{action === "disconnect" ? t("googleCalendarDisconnecting") : t("disconnectGoogleCalendar")}</Button>
        </footer>
      </Dialog>
    </section>
  );
}
