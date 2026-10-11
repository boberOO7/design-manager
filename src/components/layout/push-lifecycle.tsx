"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { disableWebPush, pushSupported, reconcileWebPush } from "@/lib/web-push/browser";

export function PushLifecycle({ userId }: { userId: string }) {
  const locale = useLocale();
  useEffect(() => {
    if (!pushSupported()) return;
    let running = false;
    let disposed = false;
    const reconcile = async () => {
      if (running || disposed) return;
      running = true;
      try { await reconcileWebPush(userId, locale); }
      catch { /* Keep ordinary website use available when Push is unavailable. */ }
      finally { running = false; window.dispatchEvent(new Event("studioflow-push-change")); }
    };
    const visible = () => { if (document.visibilityState === "visible") void reconcile(); };
    const message = (event: MessageEvent<unknown>) => {
      if (event.data && typeof event.data === "object" && "type" in event.data && event.data.type === "STUDIOFLOW_PUSH_CHANGED") void reconcile();
    };
    let permission: PermissionStatus | undefined;
    void navigator.permissions?.query({ name: "notifications" }).then(value => {
      if (!disposed) { permission = value; value.addEventListener("change", reconcile); }
    }).catch(() => {});
    const auth = createClient().auth.onAuthStateChange((event, session) => {
      // The event is a cleanup signal, never the registration authorization source.
      if (event === "SIGNED_OUT" || (session?.user.id && session.user.id !== userId)) {
        window.setTimeout(() => { void disableWebPush().catch(() => {}); }, 0);
      }
    });
    void reconcile();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", reconcile);
    navigator.serviceWorker.addEventListener("message", message);
    return () => {
      disposed = true;
      permission?.removeEventListener("change", reconcile);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", reconcile);
      navigator.serviceWorker.removeEventListener("message", message);
      auth.data.subscription.unsubscribe();
    };
  }, [userId, locale]);
  return null;
}
