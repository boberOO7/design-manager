/* StudioFlow deliberately has no fetch handler and no offline cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function receiptDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("studioflow-push-receipts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("shown");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Only opaque delivery IDs are stored, never notification content or app data.
async function receipt(id, write = false) {
  const db = await receiptDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("shown", write ? "readwrite" : "readonly");
      const request = write ? transaction.objectStore("shown").put(true, id) : transaction.objectStore("shown").get(id);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

async function resolveNotification(data) {
  if (!data || !uuid.test(data.notificationId) || !uuid.test(data.subscriptionId) || !uuid.test(data.recipientId)) return null;
  const response = await fetch(`/api/push/notifications/${data.notificationId}?subscriptionId=${data.subscriptionId}`, { credentials: "include", cache: "no-store" });
  if (!response.ok) return null;
  const notification = await response.json();
  if (notification.recipientId !== data.recipientId || typeof notification.href !== "string") return null;
  const url = new URL(notification.href, self.location.origin);
  if (url.origin !== self.location.origin) return null;
  return { ...notification, url: url.href };
}

let pushWork = Promise.resolve();
self.addEventListener("push", event => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }
  pushWork = pushWork.catch(() => {}).then(async () => {
    if (Notification.permission !== "granted") return;
    const notification = await resolveNotification(data);
    if (!notification || notification.read || await receipt(data.notificationId).catch(() => false)) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some(client => client.focused && new URL(client.url).origin === self.location.origin)) {
      await receipt(data.notificationId, true).catch(() => {});
      return;
    }
    // Use only the server's privacy-filtered preview, after recipient validation.
    // Older server responses still have the generic, localized fallback.
    await self.registration.showNotification(typeof notification.title === "string" && notification.title.trim() ? notification.title : "StudioFlow", {
      body: typeof notification.body === "string" && notification.body.trim() ? notification.body : data.body === "You have a new notification in StudioFlow." ? data.body : "У вас нове сповіщення у StudioFlow.",
      icon: "/icons/studioflow-192.png", badge: "/icons/studioflow-badge.png",
      tag: `studioflow-${data.notificationId}`, renotify: false,
      data: { notificationId: data.notificationId, subscriptionId: data.subscriptionId, recipientId: data.recipientId },
    });
    await receipt(data.notificationId, true).catch(() => {});
  });
  event.waitUntil(pushWork);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const notification = await resolveNotification(event.notification.data).catch(() => null);
    const target = notification?.url ?? new URL("/dashboard", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      try {
        await existing.focus();
        const navigated = await existing.navigate(target);
        if (navigated) return;
      } catch { /* The window may have closed while the click was handled. */ }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener("pushsubscriptionchange", event => {
  // Never silently opt in with a different endpoint; reconcile on the next visit.
  event.waitUntil((async () => {
    if (event.oldSubscription) {
      await fetch("/api/push/subscriptions", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }) }).catch(() => {});
    }
    const windows = await self.clients.matchAll({ type: "window" });
    windows.forEach(client => client.postMessage({ type: "STUDIOFLOW_PUSH_CHANGED" }));
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type !== "STUDIOFLOW_PUSH_CLEAR") return;
  event.waitUntil((async () => {
    const notifications = await self.registration.getNotifications();
    notifications.forEach(notification => notification.close());
    const db = await receiptDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("shown", "readwrite");
      transaction.objectStore("shown").clear();
      transaction.oncomplete = resolve;
      transaction.onerror = reject;
    });
    db.close();
  })());
});
