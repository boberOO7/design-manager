import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const bellPath = new URL("./notification-bell.tsx", import.meta.url);

describe("realtime notification bell", () => {
  it("subscribes only to new notifications for the current user and cleans up", async () => {
    const source = await readFile(bellPath, "utf8");
    expect(source).toContain('{ event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }');
    expect(source).toContain("knownIdsRef.current.add(item.id)");
    expect(source).toContain("supabase.removeChannel(channel)");
  });

  it("uses the existing destination without coupling dismissal to read state", async () => {
    const source = await readFile(bellPath, "utf8");
    const toast = source.slice(source.indexOf("function RealtimeNotificationToast"), source.indexOf("export function NotificationBell"));
    expect(toast).toContain("href={item.href}");
    expect(toast).toContain("setTimeout(startDismiss, 5000)");
    expect(source).toContain('aria-live="polite"');
    expect(toast).not.toContain("readOne");
    expect(toast).not.toContain("markNotificationRead");
  });
});
