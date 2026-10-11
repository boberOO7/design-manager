import { z } from "zod";

const optInKey = "studioflow-push-owner";
let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;
let enabling = false;

export function pushSupported() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true);
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && (!ios || standalone);
}

export function registerStudioFlowWorker() {
  registrationPromise ??= navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(() => navigator.serviceWorker.ready).catch(error => {
    registrationPromise = undefined;
    throw error;
  });
  return registrationPromise;
}

const statusSchema = z.object({ userId: z.uuid(), publicKey: z.string().nullable(), enabled: z.boolean() });

export async function pushStatus(subscription?: PushSubscription | null) {
  // Keep endpoint capabilities out of URLs and ordinary access logs.
  const response = await fetch("/api/push/subscriptions", { cache: "no-store", headers: subscription ? { "X-Push-Endpoint": subscription.endpoint } : {} });
  if (!response.ok) throw new Error("Push status unavailable.");
  return statusSchema.parse(await response.json());
}

export function pushOptInOwner() {
  try { return localStorage.getItem(optInKey); } catch { return null; }
}

export async function disableWebPush() {
  try { localStorage.removeItem(optInKey); } catch { /* Storage may be disabled. */ }
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;
  registration.active?.postMessage({ type: "STUDIOFLOW_PUSH_CLEAR" });
  const subscription = await registration.pushManager?.getSubscription();
  if (!subscription) return;
  // Unsubscribe first: a network failure must not leave this browser receiving.
  if (!await subscription.unsubscribe()) throw new Error("Browser unsubscribe failed.");
  // An unsubscribed endpoint is harmless if server cleanup has to wait for 410
  // or session deletion; a temporary network outage must not prevent logout.
  await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => {});
  window.dispatchEvent(new Event("studioflow-push-change"));
}

async function saveSubscription(subscription: PushSubscription, locale: string, userId: string) {
  const serialized = subscription.toJSON();
  const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUserId: userId, endpoint: subscription.endpoint, keys: serialized.keys, locale: locale === "en" ? "en" : "uk" }) });
  if (!response.ok) throw new Error("Push registration failed.");
  const result = z.object({ userId: z.uuid() }).parse(await response.json());
  if (result.userId !== userId) throw new Error("Push user changed.");
}

function subscriptionKey(subscription: PushSubscription) {
  const key = subscription.options.applicationServerKey;
  return key ? btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : null;
}

export async function enableWebPush(userId: string, locale: string) {
  enabling = true;
  try {
    // Must be invoked directly by the user's click, before any awaited work.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const registration = await registerStudioFlowWorker();
    const status = await pushStatus();
    if (status.userId !== userId || !status.publicKey) throw new Error("Push is not configured.");
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && (pushOptInOwner() !== userId || subscriptionKey(subscription) !== status.publicKey)) {
      await disableWebPush();
      subscription = null;
    }
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: status.publicKey });
    try {
      await saveSubscription(subscription, locale, userId);
      localStorage.setItem(optInKey, userId);
    } catch (error) {
      await subscription.unsubscribe();
      try { localStorage.removeItem(optInKey); } catch { /* Storage may be disabled. */ }
      throw error;
    }
    window.dispatchEvent(new Event("studioflow-push-change"));
  } finally { enabling = false; }
}

export async function reconcileWebPush(userId: string, locale: string) {
  if (!pushSupported() || enabling) return;
  const owner = pushOptInOwner();
  const registration = await registerStudioFlowWorker();
  const subscription = await registration.pushManager.getSubscription();
  if (owner !== userId || Notification.permission !== "granted") {
    if (owner || subscription) await disableWebPush();
    return;
  }
  // An expired endpoint or rotated VAPID key needs another explicit enable click.
  if (!subscription) { localStorage.removeItem(optInKey); return; }
  const status = await pushStatus(subscription);
  if (status.userId !== userId || !status.publicKey) return;
  if (!status.enabled) { await disableWebPush(); return; }
  if (subscriptionKey(subscription) !== status.publicKey) { await disableWebPush(); return; }
  // Refresh locale/session binding only for an existing explicit registration.
  await saveSubscription(subscription, locale, userId);
}
