import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const layoutPath = new URL("./layout.tsx", import.meta.url);
const privacyPath = new URL("./privacy/page.tsx", import.meta.url);
const termsPath = new URL("./terms/page.tsx", import.meta.url);
const englishMessagesPath = new URL("../../../messages/en.json", import.meta.url);

describe("public legal pages", () => {
  it("publishes indexable production URLs with the required metadata", async () => {
    const [privacy, terms] = await Promise.all([
      readFile(privacyPath, "utf8"),
      readFile(termsPath, "utf8"),
    ]);

    expect(privacy).toContain('title: "Privacy Policy | StudioFlow"');
    expect(privacy).toContain('canonical: "https://studio-flow.space/privacy"');
    expect(terms).toContain('title: "Terms of Service | StudioFlow"');
    expect(terms).toContain('canonical: "https://studio-flow.space/terms"');
    expect(`${privacy}${terms}`).toContain("index: true, follow: true");
    expect(`${privacy}${terms}`).not.toContain("vercel.app");
  });

  it("keeps the legal layout independent from authenticated app access", async () => {
    const layout = await readFile(layoutPath, "utf8");

    expect(layout).toContain('href="/privacy"');
    expect(layout).toContain('href="/terms"');
    expect(layout).toContain("LanguageSelector");
    expect(layout).toContain("ThemeSwitch");
    expect(layout).not.toContain("resolveActiveStudioMembership");
    expect(layout).not.toContain("redirect(");
  });

  it("discloses the Google integration and contact channel", async () => {
    const messages = JSON.parse(await readFile(englishMessagesPath, "utf8")) as {
      Legal: { privacy: Record<string, unknown> };
    };
    const privacyCopy = JSON.stringify(messages.Legal.privacy);

    expect(privacyCopy).toContain("Google OAuth");
    expect(privacyCopy).toContain("encrypted Google refresh token");
    expect(privacyCopy).toContain("one-way from StudioFlow to Google Calendar");
    expect(privacyCopy).toContain("does not import Google Calendar events");
    expect(privacyCopy).toContain("Google API Services User Data Policy");
    expect(privacyCopy).toContain("studioflow.notifications@gmail.com");
  });
});
