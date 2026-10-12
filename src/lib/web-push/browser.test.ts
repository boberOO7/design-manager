import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVAPIDKeys } from "web-push";
const userId = "65000000-0000-4000-8000-000000000010";
const otherId = "65000000-0000-4000-8000-000000000011";
const publicKey = generateVAPIDKeys().publicKey;
const stored = new Map<string, string>();
const requestPermission = vi.fn();
const unsubscribe = vi.fn();
const getSubscription = vi.fn();
const getRegistration = vi.fn();
const subscribe = vi.fn();
const fetchMock = vi.fn();
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/device", unsubscribe, toJSON: () => ({ keys: { p256dh: "B".repeat(87), auth: "C".repeat(22) } }), options: { applicationServerKey: Uint8Array.from(Buffer.from(publicKey,"base64url")).buffer } };
const registration = Object.assign(new EventTarget(), {
  pushManager: { getSubscription, subscribe },
  active: Object.assign(new EventTarget(), { state: "activated", postMessage: vi.fn() }),
  installing: null, waiting: null, update: vi.fn(),
});

describe("Push browser lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    stored.clear();
    vi.stubGlobal("window", { isSecureContext: true, PushManager: {}, Notification: {}, matchMedia: () => ({ matches: false }), dispatchEvent: vi.fn() });
    getRegistration.mockResolvedValue(registration);
    vi.stubGlobal("navigator", { userAgent: "Chrome Windows", serviceWorker: { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration), getRegistration } });
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string,value: string) => stored.set(key,value), removeItem: (key: string) => stored.delete(key) });
    vi.stubGlobal("fetch", fetchMock);
    getSubscription.mockResolvedValue(null);
    subscribe.mockResolvedValue(subscription);
    unsubscribe.mockResolvedValue(true);
    requestPermission.mockResolvedValue("granted");
    fetchMock.mockImplementation(async (_url, options) => new Response(JSON.stringify(options?.method === "POST" ? { enabled: true, userId } : { userId, publicKey, enabled: true }), { status: 200 }));
    registration.update.mockResolvedValue(registration);
    registration.active.postMessage.mockImplementation((message, ports?: MessagePort[]) => {
      if (message.type === "STUDIOFLOW_PUSH_CLEAR") ports?.[0]?.postMessage({ type: "STUDIOFLOW_PUSH_CLEARED" });
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("requests permission only when the user explicitly enables Push, without installation", async () => {
    const { enableWebPush } = await import("./browser");
    const enabling = enableWebPush(userId,"uk");
    expect(requestPermission).toHaveBeenCalledOnce();
    await enabling;
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: publicKey });
    expect(stored.get("studioflow-push-owner")).toBe(userId);
    expect(registration.active.postMessage).toHaveBeenCalledWith({ type: "STUDIOFLOW_PUSH_ENABLED" });
  });
  it("does not subscribe after permission denial", async () => {
    requestPermission.mockResolvedValue("denied");
    await (await import("./browser")).enableWebPush(userId,"uk");
    expect(subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("revoked permission removes the subscription without requesting permission", async () => {
    stored.set("studioflow-push-owner",userId);
    getSubscription.mockResolvedValue(subscription);
    vi.stubGlobal("Notification", { permission: "denied", requestPermission });
    await (await import("./browser")).reconcileWebPush(userId,"uk");
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(stored.size).toBe(0);
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it("changed users unsubscribe and require a fresh opt-in", async () => {
    stored.set("studioflow-push-owner",otherId);
    getSubscription.mockResolvedValue(subscription);
    await (await import("./browser")).reconcileWebPush(userId,"uk");
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("logout unsubscribes locally before remote cleanup and tolerates offline cleanup", async () => {
    stored.set("studioflow-push-owner",userId);
    getSubscription.mockResolvedValue(subscription);
    fetchMock.mockRejectedValue(new Error("offline"));
    await (await import("./browser")).disableWebPush();
    expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(stored.size).toBe(0);
    expect(registration.active.postMessage).toHaveBeenCalledWith({ type: "STUDIOFLOW_PUSH_CLEAR" }, [expect.any(MessagePort)]);
  });
  it("logout cleanup waits for the worker ACK even without a current subscription", async () => {
    let acknowledge = () => {};
    registration.active.postMessage.mockImplementation((_message, ports?: MessagePort[]) => {
      acknowledge = () => ports?.[0]?.postMessage({ type: "STUDIOFLOW_PUSH_CLEARED" });
    });
    let completed = false;
    const cleanup = (await import("./browser")).disableWebPush().then(() => { completed = true; });
    await vi.waitFor(() => expect(registration.active.postMessage).toHaveBeenCalledOnce());
    expect(completed).toBe(false);
    acknowledge();
    await cleanup;
    expect(completed).toBe(true);
  });
  it("outdated worker logout activates a replacement and requires its CLEAR acknowledgement", async () => {
    const previous = Object.assign(new EventTarget(), { state: "activated", postMessage: vi.fn() });
    const replacement = Object.assign(new EventTarget(), { state: "installing", postMessage: vi.fn() });
    const lifecycle = Object.assign(new EventTarget(), {
      active: previous, installing: replacement, waiting: null,
      pushManager: { getSubscription }, update: vi.fn().mockResolvedValue(undefined),
    });
    getRegistration.mockResolvedValueOnce(lifecycle);
    getSubscription.mockResolvedValue(subscription);
    let acknowledge = () => {};
    replacement.postMessage.mockImplementation((_message, ports?: MessagePort[]) => {
      acknowledge = () => ports?.[0]?.postMessage({ type: "STUDIOFLOW_PUSH_CLEARED" });
    });
    const { disableWebPush } = await import("./browser");
    vi.useFakeTimers();
    try {
      let completed = false;
      const cleanup = disableWebPush().then(() => { completed = true; });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(previous.postMessage).toHaveBeenCalledOnce();
      expect(lifecycle.update).toHaveBeenCalledOnce();
      expect(completed).toBe(false);
      expect(unsubscribe).not.toHaveBeenCalled();
      lifecycle.active = replacement;
      replacement.state = "activating";
      previous.state = "redundant";
      previous.dispatchEvent(new Event("statechange"));
      await vi.advanceTimersByTimeAsync(0);
      expect(replacement.postMessage).not.toHaveBeenCalled();
      replacement.state = "activated";
      replacement.dispatchEvent(new Event("statechange"));
      await vi.advanceTimersByTimeAsync(0);
      expect(replacement.postMessage).toHaveBeenCalledWith({ type: "STUDIOFLOW_PUSH_CLEAR" }, [expect.any(MessagePort)]);
      expect(completed).toBe(false);
      expect(unsubscribe).not.toHaveBeenCalled();
      acknowledge();
      await cleanup;
      expect(completed).toBe(true);
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("logout cleanup rejects a failed worker ACK", async () => {
    registration.active.postMessage.mockImplementation((_message, ports?: MessagePort[]) => {
      ports?.[0]?.postMessage({ type: "STUDIOFLOW_PUSH_CLEAR_FAILED" });
    });
    await expect((await import("./browser")).disableWebPush()).rejects.toThrow("Push cleanup failed.");
  });
  it("logout cleanup times out without treating a missing worker ACK as success", async () => {
    registration.active.postMessage.mockImplementation(() => {});
    const { disableWebPush } = await import("./browser");
    vi.useFakeTimers();
    try {
      const cleanup = disableWebPush();
      const failure = expect(cleanup).rejects.toThrow("Push cleanup acknowledgement timed out.");
      await vi.advanceTimersByTimeAsync(10_000);
      await failure;
    } finally { vi.useRealTimers(); }
  });
  it("rolls back browser registration when the account changes during enable", async () => {
    fetchMock.mockImplementation(async (_url, options) => new Response(JSON.stringify(options?.method === "POST" ? { userId: otherId } : { userId, publicKey, enabled: false }), { status: 200 }));
    await expect((await import("./browser")).enableWebPush(userId,"uk")).rejects.toThrow("user changed");
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(stored.size).toBe(0);
    expect(registration.active.postMessage).not.toHaveBeenCalledWith({ type: "STUDIOFLOW_PUSH_ENABLED" });
  });
  it("same-user reconciliation never asks permission", async () => {
    stored.set("studioflow-push-owner",userId);
    getSubscription.mockResolvedValue(subscription);
    await (await import("./browser")).reconcileWebPush(userId,"en");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/push/subscriptions", expect.objectContaining({ method: "POST" }));
  });
  it("an in-flight reconciliation cannot unsubscribe the subsequent opt-in", async () => {
    let release = () => {};
    getSubscription.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(null); }));
    const browser = await import("./browser");
    const reconciling = browser.reconcileWebPush(userId, "uk");
    await vi.waitFor(() => expect(getSubscription).toHaveBeenCalledOnce());
    const enabling = browser.enableWebPush(userId, "uk");
    expect(requestPermission).toHaveBeenCalledOnce();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(subscribe).not.toHaveBeenCalled();
    release();
    await Promise.all([reconciling, enabling]);
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(stored.get("studioflow-push-owner")).toBe(userId);
  });
  it("disable waits for an in-flight refresh registration before deleting it", async () => {
    stored.set("studioflow-push-owner", userId);
    getSubscription.mockResolvedValue(subscription);
    let release = () => {};
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") return new Promise(resolve => { release = () => resolve(new Response(JSON.stringify({ userId }))); });
      return new Response(JSON.stringify({ userId, publicKey, enabled: true }));
    });
    const browser = await import("./browser");
    const reconciling = browser.reconcileWebPush(userId, "uk");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/push/subscriptions", expect.objectContaining({ method: "POST" })));
    const disabling = browser.disableWebPush();
    expect(unsubscribe).not.toHaveBeenCalled();
    release();
    await Promise.all([reconciling, disabling]);
    expect(fetchMock.mock.calls.at(-1)?.[1].method).toBe("DELETE");
    expect(stored.size).toBe(0);
  });
  it("does not silently revive an expired endpoint", async () => {
    stored.set("studioflow-push-owner",userId);
    getSubscription.mockResolvedValue(subscription);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId, publicKey, enabled: false })));
    await (await import("./browser")).reconcileWebPush(userId,"en");
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).not.toHaveBeenCalled();
    expect(stored.size).toBe(0);
  });
});
