import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const headerPath = new URL("./app-header.tsx", import.meta.url);
const sidebarPath = new URL("./app-sidebar.tsx", import.meta.url);
const controlPath = new URL("./shell-control.tsx", import.meta.url);
const dashboardPath = new URL("../../app/(app)/dashboard/page.tsx", import.meta.url);
const layoutPath = new URL("../../app/(app)/layout.tsx", import.meta.url);
const stylesPath = new URL("../../app/globals.css", import.meta.url);

describe("application shell cleanup", () => {
  it("uses a single shared shell-control primitive for persistent header actions", async () => {
    const [control, header] = await Promise.all([
      readFile(controlPath, "utf8"),
      readFile(headerPath, "utf8"),
    ]);
    expect(control).toContain("min-h-11");
    expect(control).toContain("focus-visible:ring-2");
    expect(header).toContain("NotificationBell");
    expect(header).toContain("ThemeSwitch");
  });

  it("keeps desktop navigation persistent and removes repeated Dashboard identity", async () => {
    const [sidebar, dashboard] = await Promise.all([
      readFile(sidebarPath, "utf8"),
      readFile(dashboardPath, "utf8"),
    ]);
    expect(sidebar).not.toContain("collapsed");
    expect(sidebar).not.toContain("PanelLeft");
    expect(sidebar).toContain("w-72");
    expect(sidebar).toContain("studioName");
    expect(sidebar).toContain("StudioFlowMark");
    expect(sidebar).not.toContain("toLocaleUpperCase");
    expect(sidebar).toContain('t("poweredBy", { product: "StudioFlow" })');
    expect(sidebar).not.toContain('t("tagline")');
    expect(sidebar).toContain("overflow-y-auto");
    expect(dashboard).not.toContain("Welcome back, ${dashboard.profile.full_name}");
  });

  it("uses one tokenized height and divider for both desktop shell headers", async () => {
    const [header, sidebar, styles] = await Promise.all([
      readFile(headerPath, "utf8"),
      readFile(sidebarPath, "utf8"),
      readFile(stylesPath, "utf8"),
    ]);
    expect(styles).toContain("--ui-shell-header-height: 4.75rem");
    expect(header).toContain("h-[var(--ui-shell-header-height)]");
    expect(sidebar).toContain("h-[var(--ui-shell-header-height)]");
    expect(header).toContain("border-b border-[var(--ui-border)]");
    expect(sidebar).toContain("border-b border-[var(--ui-border)]");
  });

  it("derives authenticated page titles from the active studio context", async () => {
    const [layout, dashboard] = await Promise.all([
      readFile(layoutPath, "utf8"),
      readFile(dashboardPath, "utf8"),
    ]);

    expect(layout).toContain("resolveActiveStudioMembership");
    expect(layout).toContain("%s · ${studio.studioName} · ${productTitle}");
    expect(dashboard).toContain('return { title: t("metadata") }');
  });

  it("centralizes active-studio access routing at the authenticated layout boundary", async () => {
    const layout = await readFile(layoutPath, "utf8");
    expect(layout).toContain('access.status === "UNAUTHENTICATED"');
    expect(layout).toContain('redirect("/access-unavailable")');
    expect(layout).toContain('access.status === "MULTIPLE_ACTIVE_STUDIOS"');
  });
});
