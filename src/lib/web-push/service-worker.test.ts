import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker(windows: { focused: boolean; visibilityState: "visible" | "hidden"; url?: string }[] = [{ focused: false, visibilityState: "visible" }]) {
  const handlers = new Map<string, (event: object) => void>();
  const shown = new Map<string, boolean>();
  const show = vi.fn().mockResolvedValue(undefined);
  const getNotifications = vi.fn().mockResolvedValue([]);
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
        clear: () => { shown.clear(); return { result: undefined }; },
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
  const matchAll = vi.fn(async () => windows.map(client => ({ ...client, url: client.url ?? "https://studio.test/dashboard", navigate, focus })));
  runInNewContext(readFileSync("public/sw.js","utf8"), { URL, AbortController, Notification: { permission: "granted" }, indexedDB, fetch,
    self: { location: { origin: "https://studio.test" }, addEventListener: (name: string,handler: (event: object) => void) => handlers.set(name,handler),
      registration: { showNotification: show, getNotifications }, clients: { matchAll, openWindow } },
  });
  async function fire(name: string, input: object) {
    let work = Promise.resolve();
    handlers.get(name)?.({ ...input, waitUntil: (promise: Promise<void>) => { work = promise; } });
    await work;
  }
  const data = { notificationId: "65000000-0000-0000-0000-000000000030", subscriptionId: "65000000-0000-0000-0000-000000000020", recipientId: "65000000-0000-0000-0000-000000000010", body: "Sensitive HR preview" };
  return { handlers, show, getNotifications, matchAll, navigate, focus, fetch, openWindow, data, fire };
}

describe("background Push service worker", () => {
  it("CLEAR aborts an in-flight preview and invalidates queued push work", async () => {
    const w = worker();
    let signal: AbortSignal | undefined;
    w.fetch.mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      signal = options.signal ?? undefined;
      signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const pending = w.fire("push", { data: { json: () => w.data } });
    await vi.waitFor(() => expect(w.fetch).toHaveBeenCalledOnce());
    const queued = w.fire("push", { data: { json: () => ({ ...w.data, notificationId: "65000000-0000-0000-0000-000000000031" }) } });
    const port = { postMessage: vi.fn(), close: vi.fn() };
    await w.fire("message", { data: { type: "STUDIOFLOW_PUSH_CLEAR" }, ports: [port] });
    await Promise.all([pending, queued]);
    expect(signal?.aborted).toBe(true);
    expect(w.fetch).toHaveBeenCalledOnce();
    expect(w.show).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith({ type: "STUDIOFLOW_PUSH_CLEARED" });
    expect(port.close).toHaveBeenCalledOnce();
  });

  it("CLEAR prevents a late preview response from displaying after cancellation", async () => {
    const w = worker();
    let release = () => {};
    w.fetch.mockImplementationOnce(() => new Promise(resolve => {
      release = () => resolve({ ok: true, json: async () => ({ recipientId: w.data.recipientId, href: "/dashboard", read: false }) });
    }));
    const pending = w.fire("push", { data: { json: () => w.data } });
    await vi.waitFor(() => expect(w.fetch).toHaveBeenCalledOnce());
    const port = { postMessage: vi.fn(), close: vi.fn() };
    const clearing = w.fire("message", { data: { type: "STUDIOFLOW_PUSH_CLEAR" }, ports: [port] });
    release();
    await Promise.all([pending, clearing]);
    expect(w.show).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith({ type: "STUDIOFLOW_PUSH_CLEARED" });
  });

  it("CLEAR rechecks cancellation after the asynchronous window lookup", async () => {
    const w = worker();
    let release = () => {};
    w.matchAll.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve([]); }));
    const pending = w.fire("push", { data: { json: () => w.data } });
    await vi.waitFor(() => expect(w.matchAll).toHaveBeenCalledOnce());
    const clearing = w.fire("message", { data: { type: "STUDIOFLOW_PUSH_CLEAR" } });
    release();
    await Promise.all([pending, clearing]);
    expect(w.show).not.toHaveBeenCalled();
  });

  it("CLEAR waits for an in-flight display, closes it before ACK and requires fresh opt-in", async () => {
    const w = worker();
    let release = () => {};
    w.show.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(undefined); }));
    const pending = w.fire("push", { data: { json: () => w.data } });
    await vi.waitFor(() => expect(w.show).toHaveBeenCalledOnce());
    const close = vi.fn();
    w.getNotifications.mockResolvedValueOnce([{ close }]);
    const port = { postMessage: vi.fn(), close: vi.fn() };
    const clearing = w.fire("message", { data: { type: "STUDIOFLOW_PUSH_CLEAR" }, ports: [port] });
    expect(w.getNotifications).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
    release();
    await Promise.all([pending, clearing]);
    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(port.postMessage.mock.invocationCallOrder[0]);
    expect(port.postMessage).toHaveBeenCalledWith({ type: "STUDIOFLOW_PUSH_CLEARED" });
    await w.fire("push", { data: { json: () => w.data } });
    expect(w.show).toHaveBeenCalledOnce();
    await w.fire("message", { data: { type: "STUDIOFLOW_PUSH_ENABLED" } });
    await w.fire("push", { data: { json: () => w.data } });
    expect(w.show).toHaveBeenCalledTimes(2);
  });

  it("CLEAR reports failed cleanup rather than acknowledging success", async () => {
    const w = worker();
    w.getNotifications.mockRejectedValueOnce(new Error("worker cleanup failed"));
    const port = { postMessage: vi.fn(), close: vi.fn() };
    await w.fire("message", { data: { type: "STUDIOFLOW_PUSH_CLEAR" }, ports: [port] });
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "STUDIOFLOW_PUSH_CLEAR_FAILED" });
  });

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
  it("displays an authenticated self-test while focused and keeps normal suppression", async () => {
    const w = worker([{ focused: true, visibilityState: "visible" }]);
    w.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ recipientId: w.data.recipientId, href: "/dashboard", read: false, title: "StudioFlow", body: "Це тестове сповіщення StudioFlow.", test: true }) });
    await w.fire("push", { data: { json: () => ({ ...w.data, test: true }) } });
    expect(w.fetch).toHaveBeenCalledWith(`/api/push/test?subscriptionId=${w.data.subscriptionId}`, expect.objectContaining({ credentials: "include" }));
    expect(w.show).toHaveBeenCalledWith("StudioFlow", expect.objectContaining({ body: "Це тестове сповіщення StudioFlow." }));
    await w.fire("push", { data: { json: () => ({ ...w.data, notificationId: "65000000-0000-0000-0000-000000000031" }) } });
    expect(w.show).toHaveBeenCalledOnce();
  });
  it("a test flag cannot bypass the authenticated recipient check", async () => {
    const w = worker([{ focused: true, visibilityState: "visible" }]);
    w.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ recipientId: "another-user", href: "/dashboard", read: false, test: true }) });
    await w.fire("push", { data: { json: () => ({ ...w.data, test: true }) } });
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
