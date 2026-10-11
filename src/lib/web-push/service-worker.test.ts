import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker(windows: { focused: boolean; visibilityState: "visible" | "hidden"; url?: string }[] = [{ focused: false, visibilityState: "visible" }]) {
  const handlers = new Map<string, (event: object) => void>();
  const shown = new Map<string, boolean>();
  const show = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn().mockResolvedValue({});
  const focus = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn();
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ recipientId: "65000000-0000-0000-0000-000000000010", href: "/projects/project?task=task", read: false }) });
  const database = {
    close: () => {},
    transaction: () => {
      const transaction = { oncomplete: () => {}, objectStore: () => ({
        get: (id: string) => ({ result: shown.get(id) }),
        put: (value: boolean,id: string) => { shown.set(id,value); return { result: id }; },
      }) };
      queueMicrotask(() => transaction.oncomplete());
      return transaction;
    },
  };
  const indexedDB = { open: () => {
    const request = { result: database, onsuccess: () => {} };
    queueMicrotask(() => request.onsuccess());
    return request;
  } };
  runInNewContext(readFileSync("public/sw.js","utf8"), { URL, Notification: { permission: "granted" }, indexedDB, fetch,
    self: { location: { origin: "https://studio.test" }, addEventListener: (name: string,handler: (event: object) => void) => handlers.set(name,handler),
      registration: { showNotification: show }, clients: { matchAll: async () => windows.map(client => ({ ...client, url: client.url ?? "https://studio.test/dashboard", navigate, focus })), openWindow } },
  });
  async function fire(name: string, input: object) {
    let work = Promise.resolve();
    handlers.get(name)?.({ ...input, waitUntil: (promise: Promise<void>) => { work = promise; } });
    await work;
  }
  const data = { notificationId: "65000000-0000-0000-0000-000000000030", subscriptionId: "65000000-0000-0000-0000-000000000020", recipientId: "65000000-0000-0000-0000-000000000010", body: "Sensitive HR preview" };
  return { handlers, show, navigate, focus, fetch, openWindow, data, fire };
}

describe("background Push service worker", () => {
  it("displays the authorized server preview instead of untrusted push text", async () => {
    const w = worker();
    w.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ recipientId: w.data.recipientId, href: "/projects/project?task=task", read: false, title: "Нове призначене завдання", body: "«План кухні» · Квартира" }) });
    await w.fire("push", { data: { json: () => ({ ...w.data, title: "Sensitive HR title" }) } });
    expect(w.show).toHaveBeenCalledWith("Нове призначене завдання", expect.objectContaining({ body: "«План кухні» · Квартира" }));
  });
  it("shows a generic notification in the background and deduplicates retries", async () => {
    const w = worker();
    await w.fire("push",{ data: { json: () => w.data } });
    await w.fire("push",{ data: { json: () => w.data } });
    expect(w.show).toHaveBeenCalledOnce();
    expect(w.show).toHaveBeenCalledWith("StudioFlow", expect.objectContaining({ body: "У вас нове сповіщення у StudioFlow.", tag: `studioflow-${w.data.notificationId}` }));
    expect(w.handlers.has("fetch")).toBe(false);
  });
  it("suppresses notifications when an app window is focused", async () => {
    const w = worker([{ focused: true, visibilityState: "visible" }]);
    await w.fire("push",{ data: { json: () => w.data } });
    expect(w.show).not.toHaveBeenCalled();
  });
  it.each([
    { name: "visible StudioFlow tab with another tab or application focused", windows: [{ focused: false, visibilityState: "visible" as const }] },
    { name: "minimized StudioFlow window", windows: [{ focused: false, visibilityState: "hidden" as const }] },
    { name: "no StudioFlow window", windows: [] },
    { name: "focused window on another origin", windows: [{ focused: true, visibilityState: "visible" as const, url: "https://other.test" }] },
  ])("shows a notification with $name", async ({ windows }) => {
    const w = worker(windows);
    await w.fire("push", { data: { json: () => w.data } });
    expect(w.show).toHaveBeenCalledOnce();
  });
  it("checks all windows for actual focus", async () => {
    const w = worker([{ focused: false, visibilityState: "visible" }, { focused: true, visibilityState: "visible" }]);
    await w.fire("push", { data: { json: () => w.data } });
    expect(w.show).not.toHaveBeenCalled();
  });
  it("drops delivery after logout or changed users", async () => {
    const w = worker();
    w.fetch.mockResolvedValueOnce({ ok: false });
    await w.fire("push",{ data: { json: () => w.data } });
    w.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ recipientId: "another-user", href: "/dashboard" }) });
    await w.fire("push",{ data: { json: () => w.data } });
    expect(w.show).not.toHaveBeenCalled();
  });
  it("revalidates the saved destination, focuses and navigates an existing window", async () => {
    const w = worker();
    const close = vi.fn();
    await w.fire("notificationclick",{ notification: { data: w.data, close } });
    expect(close).toHaveBeenCalledOnce();
    expect(w.focus).toHaveBeenCalledOnce();
    expect(w.navigate).toHaveBeenCalledWith("https://studio.test/projects/project?task=task");
    expect(w.openWindow).not.toHaveBeenCalled();
  });
  it("rejects cross-origin destinations on click", async () => {
    const w = worker();
    w.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ recipientId: w.data.recipientId, href: "https://evil.test" }) });
    await w.fire("notificationclick",{ notification: { data: w.data, close: vi.fn() } });
    expect(w.navigate).toHaveBeenCalledWith("https://studio.test/dashboard");
  });
});
