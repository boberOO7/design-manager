import { z } from "zod";

const optInKey = "studioflow-push-owner";
let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;
let enabling = false;
// Reconciliation must finish before a toggle creates or removes an endpoint.
let pushOperation: Promise<unknown> = Promise.resolve();

function serializePush<T>(operation: () => Promise<T>) {
  const pending = pushOperation.catch(() => {}).then(operation);
  pushOperation = pending;
  return pending;
}

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

async function clearWorkerNotifications(worker: ServiceWorker) {
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      if (error) reject(error); else resolve();
    };
    const timeout = setTimeout(() => finish(new Error("Push cleanup acknowledgement timed out.")), 10_000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data && typeof event.data === "object" && "type" in event.data) {
        if (event.data.type === "STUDIOFLOW_PUSH_CLEARED") finish();
        else if (event.data.type === "STUDIOFLOW_PUSH_CLEAR_FAILED") finish(new Error("Push cleanup failed."));
      }
    };
    try { worker.postMessage({ type: "STUDIOFLOW_PUSH_CLEAR" }, [channel.port2]); }
    catch { finish(new Error("Push cleanup unavailable.")); }
  });
}

async function updatedWorker(registration: ServiceWorkerRegistration, previous: ServiceWorker) {
  return new Promise<ServiceWorker>((resolve, reject) => {
    const workers = new Set<ServiceWorker>();
    let settled = false;
    const finish = (worker?: ServiceWorker) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      registration.removeEventListener("updatefound", check);
      workers.forEach(value => value.removeEventListener("statechange", check));
      if (worker) resolve(worker); else reject(new Error("Updated Push worker unavailable."));
    };
    const check = () => {
      if (settled) return;
      for (const worker of [previous, registration.installing, registration.waiting, registration.active]) {
        if (worker && !workers.has(worker)) {
          workers.add(worker);
          worker.addEventListener("statechange", check);
        }
      }
      // Activation retires the previous worker after its pending events finish.
      // An ACK from a replacement alone cannot confirm the old worker is done.
      const active = registration.active;
      if (active && active !== previous && active.state === "activated" && previous.state === "redundant") finish(active);
    };
    const timeout = setTimeout(() => finish(), 10_000);
    registration.addEventListener("updatefound", check);
    check();
    try {
      if (!settled) void registration.update().then(() => {
        check();
        if (!registration.installing && !registration.waiting && registration.active === previous) finish();
      }).catch(() => finish());
    } catch { finish(); }
  });
}

async function clearWebPush() {
  try { localStorage.removeItem(optInKey); } catch { /* Storage may be disabled. */ }
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;
  const worker = registration.active;
  if (worker) {
    try { await clearWorkerNotifications(worker); }
    catch (error) {
      try { await clearWorkerNotifications(await updatedWorker(registration, worker)); }
      catch { throw error; } // Never replace an unconfirmed cleanup with success.
    }
  }
  const subscription = await registration.pushManager?.getSubscription();
  if (!subscription) return;
  // Unsubscribe first: a network failure must not leave this browser receiving.
  if (!await subscription.unsubscribe()) throw new Error("Browser unsubscribe failed.");
  // An unsubscribed endpoint is harmless if server cleanup has to wait for 410
  // or session deletion; a temporary network outage must not prevent logout.
  await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => {});
  window.dispatchEvent(new Event("studioflow-push-change"));
}

export function disableWebPush() {
  return serializePush(clearWebPush);
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
    const permissionRequest = Notification.requestPermission().catch(() => null);
    await serializePush(async () => {
      const permission = await permissionRequest;
      if (permission === null) throw new Error("Push permission unavailable.");
      if (permission !== "granted") return;
      const registration = await registerStudioFlowWorker();
      const status = await pushStatus();
      if (status.userId !== userId || !status.publicKey) throw new Error("Push is not configured.");
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && (pushOptInOwner() !== userId || subscriptionKey(subscription) !== status.publicKey)) {
        await clearWebPush();
        subscription = null;
      }
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: status.publicKey });
      try {
        await saveSubscription(subscription, locale, userId);
        localStorage.setItem(optInKey, userId);
        registration.active?.postMessage({ type: "STUDIOFLOW_PUSH_ENABLED" });
      } catch (error) {
        await subscription.unsubscribe();
        try { localStorage.removeItem(optInKey); } catch { /* Storage may be disabled. */ }
        throw error;
      }
      window.dispatchEvent(new Event("studioflow-push-change"));
    });
  } finally { enabling = false; }
}

export async function reconcileWebPush(userId: string, locale: string) {
  if (!pushSupported() || enabling) return;
  return serializePush(async () => {
    if (enabling) return;
    const owner = pushOptInOwner();
    const registration = await registerStudioFlowWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (owner !== userId || Notification.permission !== "granted") {
      if (owner || subscription) await clearWebPush();
      return;
    }
    // An expired endpoint or rotated VAPID key needs another explicit enable click.
    if (!subscription) { localStorage.removeItem(optInKey); return; }
    const status = await pushStatus(subscription);
    if (status.userId !== userId || !status.publicKey) return;
    if (!status.enabled) { await clearWebPush(); return; }
    if (subscriptionKey(subscription) !== status.publicKey) { await clearWebPush(); return; }
    // Refresh locale/session binding only for an existing explicit registration.
    await saveSubscription(subscription, locale, userId);
  });
}

export async function testWebPush() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return { accepted: false, reason: "subscription_missing" };
  const response = await fetch("/api/push/test", {
    method: "POST", headers: { "X-Push-Endpoint": subscription.endpoint },
  });
  const result = z.object({ accepted: z.boolean().optional(), reason: z.string().optional() }).parse(await response.json());
  return { accepted: response.ok && result.accepted === true, reason: result.reason ?? "unavailable" };
}
