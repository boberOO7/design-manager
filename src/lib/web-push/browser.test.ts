import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVAPIDKeys } from "web-push";
const userId = "65000000-0000-4000-8000-000000000010";
const otherId = "65000000-0000-4000-8000-000000000011";
const publicKey = generateVAPIDKeys().publicKey;
const stored = new Map<string, string>();
const requestPermission = vi.fn();
const unsubscribe = vi.fn();
const getSubscription = vi.fn();
const subscribe = vi.fn();
const fetchMock = vi.fn();
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/device", unsubscribe, toJSON: () => ({ keys: { p256dh: "B".repeat(87), auth: "C".repeat(22) } }), options: { applicationServerKey: Uint8Array.from(Buffer.from(publicKey,"base64url")).buffer } };
const registration = { pushManager: { getSubscription, subscribe }, active: { postMessage: vi.fn() } };

describe("Push browser lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    stored.clear();
    vi.stubGlobal("window", { isSecureContext: true, PushManager: {}, Notification: {}, matchMedia: () => ({ matches: false }), dispatchEvent: vi.fn() });
    vi.stubGlobal("navigator", { userAgent: "Chrome Windows", serviceWorker: { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration), getRegistration: vi.fn().mockResolvedValue(registration) } });
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string,value: string) => stored.set(key,value), removeItem: (key: string) => stored.delete(key) });
    vi.stubGlobal("fetch", fetchMock);
    getSubscription.mockResolvedValue(null);
    subscribe.mockResolvedValue(subscription);
    unsubscribe.mockResolvedValue(true);
    requestPermission.mockResolvedValue("granted");
    fetchMock.mockImplementation(async (_url, options) => new Response(JSON.stringify(options?.method === "POST" ? { enabled: true, userId } : { userId, publicKey, enabled: true }), { status: 200 }));
  });
  afterEach(() => vi.unstubAllGlobals());
  it("requests permission only when the user explicitly enables Push, without installation", async () => {
    const { enableWebPush } = await import("./browser");
    const enabling = enableWebPush(userId,"uk");
    expect(requestPermission).toHaveBeenCalledOnce();
    await enabling;
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: publicKey });
    expect(stored.get("studioflow-push-owner")).toBe(userId);
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
    expect(registration.active.postMessage).toHaveBeenCalledWith({ type: "STUDIOFLOW_PUSH_CLEAR" });
  });
  it("rolls back browser registration when the account changes during enable", async () => {
    fetchMock.mockImplementation(async (_url, options) => new Response(JSON.stringify(options?.method === "POST" ? { userId: otherId } : { userId, publicKey, enabled: false }), { status: 200 }));
    await expect((await import("./browser")).enableWebPush(userId,"uk")).rejects.toThrow("user changed");
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(stored.size).toBe(0);
  });
  it("same-user reconciliation never asks permission", async () => {
    stored.set("studioflow-push-owner",userId);
    getSubscription.mockResolvedValue(subscription);
    await (await import("./browser")).reconcileWebPush(userId,"en");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/push/subscriptions", expect.objectContaining({ method: "POST" }));
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
