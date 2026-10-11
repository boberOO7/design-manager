import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cleanup: vi.fn(), signOut: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => [initial, () => {}],
  useRef: (initial: unknown) => ({ current: initial }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: mocks.signOut } }), setRememberMe: vi.fn() }));
vi.mock("@/lib/web-push/browser", () => ({ disableWebPush: mocks.cleanup }));
vi.mock("@/components/layout/shell-control", () => ({ ShellControl: "button" }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: "dialog" }));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
import { SignOutButton } from "./sign-out-button";

function confirmLogout(node: ReactNode): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) continue;
    if (child.props.children === "signOut" && child.props.onClick) return child.props.onClick;
    const click = confirmLogout(child.props.children);
    if (click) return click;
  }
}

describe("logout Service Worker cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("waits for worker cleanup before revoking the session or navigating", async () => {
    let acknowledge = () => {};
    mocks.cleanup.mockImplementationOnce(() => new Promise<void>(resolve => { acknowledge = resolve; }));
    const confirm = confirmLogout(SignOutButton());
    expect(confirm).toBeDefined();
    confirm?.();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    acknowledge();
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("does not complete logout when worker cleanup fails", async () => {
    mocks.cleanup.mockRejectedValueOnce(new Error("Push cleanup failed."));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      confirmLogout(SignOutButton())?.();
      await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
      expect(mocks.signOut).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
