"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { registerStudioFlowWorker } from "@/lib/web-push/browser";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isInstallPrompt(event: Event): event is InstallPrompt {
  return "prompt" in event && typeof event.prompt === "function" && "userChoice" in event && event.userChoice instanceof Promise;
}

const PwaContext = createContext<{ standalone: boolean; install: (() => Promise<boolean>) | null }>({ standalone: false, install: null });
export const usePwa = () => useContext(PwaContext);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [standalone, setStandalone] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const pendingPrompt = useRef<InstallPrompt | null>(null);
  useEffect(() => {
    if (window.isSecureContext && "serviceWorker" in navigator) void registerStudioFlowWorker().catch(() => {});
    const media = window.matchMedia("(display-mode: standalone)");
    const refresh = () => setStandalone(media.matches || ("standalone" in navigator && navigator.standalone === true));
    const capture = (event: Event) => {
      if (!isInstallPrompt(event)) return;
      event.preventDefault();
      pendingPrompt.current = event;
      setPrompt(event);
    };
    const installed = () => { pendingPrompt.current = null; setPrompt(null); refresh(); };
    refresh();
    media.addEventListener("change", refresh);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      media.removeEventListener("change", refresh);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  const install = prompt ? async () => {
    const event = pendingPrompt.current;
    if (!event) return false;
    // Chrome install events are single-use. Consume before prompting, and do
    // not clear a newer event when this event's userChoice eventually settles.
    pendingPrompt.current = null;
    setPrompt(null);
    await event.prompt();
    return (await event.userChoice).outcome === "accepted";
  } : null;
  return <PwaContext.Provider value={{ standalone, install }}>{children}</PwaContext.Provider>;
}
