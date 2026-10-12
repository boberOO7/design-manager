"use client";

import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useLocale, useTranslations } from "next-intl";
import { Copy, Download, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwa } from "./pwa-provider";
import { SettingsHelp, settingsHelpPanelClassName } from "./settings-help";
import { disableWebPush, enableWebPush, pushOptInOwner, pushStatus, pushSupported, registerStudioFlowWorker, testWebPush } from "@/lib/web-push/browser";

type PushState = "enabled" | "disabled" | "blocked" | "unsupported";

export function SystemNotificationSettings({ userId }: { userId: string }) {
  const t = useTranslations("Account");
  const locale = useLocale();
  const [state, setState] = useState<PushState>("disabled");
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testFeedback, setTestFeedback] = useState<"pushTestAccepted" | "pushTestRateLimited" | "pushTestExpired" | "pushTestFailed" | null>(null);
  const refreshVersion = useRef(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const version = ++refreshVersion.current;
      const current = () => active && version === refreshVersion.current;
      try {
        if (!pushSupported()) { if (current()) setState("unsupported"); return; }
        if (Notification.permission === "denied") { if (current()) setState("blocked"); return; }
        const registration = await registerStudioFlowWorker();
        const subscription = await registration.pushManager.getSubscription();
        const status = await pushStatus(subscription);
        if (current()) {
          setConfigured(!!status.publicKey);
          setError(false);
          setState(Notification.permission === "granted" && status.enabled && pushOptInOwner() === userId ? "enabled" : "disabled");
        }
      } catch { if (current()) setError(true); }
      finally { if (current()) setBusy(false); }
    };
    void refresh();
    window.addEventListener("studioflow-push-change", refresh);
    return () => { active = false; window.removeEventListener("studioflow-push-change", refresh); };
  }, [userId]);

  async function toggle() {
    ++refreshVersion.current;
    setBusy(true);
    setError(false);
    setTestFeedback(null);
    try {
      if (state === "enabled") { await disableWebPush(); setState("disabled"); }
      else {
        await enableWebPush(userId, locale);
        setState(Notification.permission === "denied" ? "blocked" : pushOptInOwner() === userId ? "enabled" : "disabled");
      }
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  async function sendTest() {
    setTesting(true);
    setTestFeedback(null);
    try {
      const result = await testWebPush();
      const expired = ["subscription_missing", "provider_404", "provider_410", "vapid_public_key_mismatch", "invalid_endpoint", "invalid_subscription_key"].includes(result.reason);
      setTestFeedback(result.accepted ? "pushTestAccepted" : result.reason === "rate_limited" ? "pushTestRateLimited" : expired ? "pushTestExpired" : "pushTestFailed");
      if (expired) { await disableWebPush(); setState("disabled"); }
      window.dispatchEvent(new Event("studioflow-push-change"));
    } catch { setTestFeedback("pushTestFailed"); }
    finally { setTesting(false); }
  }

  return <div className="mt-2 border-t border-[var(--ui-border-subtle)] pt-3">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1"><span className="text-sm text-[var(--ui-text)]">{t("systemNotifications")}</span><SettingsHelp label={t("systemNotifications")}><p>{t(state === "blocked" ? "pushBlockedHelp" : state === "unsupported" ? "pushUnsupportedHelp" : "pushDescription")}</p></SettingsHelp></div>
        <p className="text-xs text-[var(--ui-text-muted)]" role="status">{t(`pushState_${state}`)}</p>
      </div>
      <Button type="button" variant="outline" size="sm" className="shrink-0" aria-label={t(state === "enabled" ? "pushDisableLabel" : "pushEnableLabel")} aria-busy={busy} disabled={busy || testing || state === "blocked" || state === "unsupported" || (!configured && state !== "enabled")} onClick={() => void toggle()}>{state === "enabled" ? t("pushDisable") : t("pushEnable")}</Button>
    </div>
    {state === "enabled" ? <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-0 text-xs" disabled={busy || testing} aria-busy={testing} onClick={() => void sendTest()}>{t(testing ? "pushTestSending" : "pushTestSend")}</Button> : null}
    {testFeedback ? <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]" role="status">{t(testFeedback)}</p> : null}
    {state === "blocked" ? <p className="mt-2 text-xs leading-5 text-[var(--ui-text-muted)]">{t("pushBlockedHelp")}</p> : null}
    {!configured ? <p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("pushNotConfigured")}</p> : null}
    {error ? <p className="mt-2 text-sm text-[var(--ui-danger-text)]" role="alert">{t("pushFailed")}</p> : null}
  </div>;
}

export function InstallStudioFlow() {
  const t = useTranslations("Account");
  const { standalone, install } = usePwa();
  const [instructions, setInstructions] = useState(false);
  const [busy, setBusy] = useState(false);
  if (standalone) return <p className="text-xs text-[var(--ui-text-muted)]" role="status">{t("pwaInstalled")}</p>;
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const help = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "installIos" : /edg/i.test(ua) ? "installEdge" : /firefox/i.test(ua) ? /android/i.test(ua) ? "installFirefoxAndroid" : "installFirefox" : /safari/i.test(ua) && !/chrome|chromium/i.test(ua) ? "installSafari" : /android/i.test(ua) ? "installChromeAndroid" : "installChrome";
  return <Popover.Root modal open={instructions} onOpenChange={open => { if (!open || (!install && !busy)) setInstructions(open); }}>
    <Popover.Trigger asChild><Button type="button" variant="ghost" size="sm" className="gap-2 px-0 text-sm text-[var(--ui-text-secondary)]" disabled={busy} onClick={async () => {
      if (!install) return;
      setInstructions(false);
      setBusy(true);
      try { await install(); } catch { setInstructions(true); } finally { setBusy(false); }
    }}><Download className="size-4" aria-hidden="true" />{t("installStudioFlow")}</Button></Popover.Trigger>
    <Popover.Portal><Popover.Content side="top" align="start" sideOffset={6} collisionPadding={12} aria-modal="true" aria-label={t("installStudioFlow")}
      className={settingsHelpPanelClassName}>
      {t(help)}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

function AutostartInstructions() {
  const t = useTranslations("Account");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (copyState !== "copied") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [copyState]);
  // Popover content mounts on interaction, so platform detection is client-only.
  const ua = navigator.userAgent;
  const mobile = /android|iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (mobile) return <p>{t("autostartMobile")}</p>;
  if (/Windows/i.test(ua)) {
    const browser = /Edg\//.test(ua) ? "edge" : /Chrome\//.test(ua) ? "chrome" : null;
    if (!browser) return <p>{t("autostartOther")}</p>;
    const address = browser === "edge" ? "edge://apps" : "chrome://apps";
    return <ol className="list-decimal space-y-2 pl-5">
      <li>
        <p>{t.rich("autostartOpenApps", { browser: browser === "edge" ? "Edge" : "Chrome", url: address, address: chunks => <code className="select-all rounded bg-[var(--ui-surface-muted)] px-1 text-xs">{chunks}</code> })}</p>
        <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 gap-1.5 px-2 text-xs" onClick={async () => {
          try { await navigator.clipboard.writeText(address); setCopyState("copied"); }
          catch { setCopyState("failed"); }
        }}><Copy className="size-3.5" aria-hidden="true" />{t(copyState === "copied" ? "autostartAddressCopied" : "autostartCopyAddress")}</Button>
        <span className="sr-only" role="status">{copyState === "copied" ? t("autostartAddressCopied") : ""}</span>
        {copyState === "failed" ? <p className="mt-1 text-xs text-[var(--ui-danger-text)]" role="alert">{t("autostartCopyFailed")}</p> : null}
      </li>
      <li>{t("autostartFindStudioFlow")}</li>
      <li>{browser === "edge" ? t.rich("autostartEdgeDetails", { option: chunks => <span lang="en">{chunks}</span> }) : t("autostartRightClick")}</li>
      <li>{t.rich(browser === "edge" ? "autostartEdge" : "autostartChrome", { option: chunks => <span lang="en">{chunks}</span> })}</li>
    </ol>;
  }
  if (/Macintosh|Mac OS X/i.test(ua)) return <p>{t("autostartMac")}</p>;
  return <p>{t("autostartOther")}</p>;
}

export function PwaSettings() {
  const t = useTranslations("Account");
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
    <InstallStudioFlow />
    <SettingsHelp label={t("configureAutostart")} trigger={<Button type="button" variant="ghost" size="sm" className="gap-2 px-0 text-xs font-medium"><Settings2 className="size-4" aria-hidden="true" />{t("configureAutostart")}</Button>}>
      <AutostartInstructions />
    </SettingsHelp>
  </div>;
}
