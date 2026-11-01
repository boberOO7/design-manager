import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

const translations = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: translations.get }));
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";

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
    expect(privacyCopy).toContain("delete the exact app-created secondary Google calendar");
    expect(privacyCopy).toContain("Google API Services User Data Policy");
    expect(privacyCopy).toContain("studioflow.notifications@gmail.com");
  });

  it.each(["en", "uk"] as const)("renders both documents in %s with working deletion/contact links and revision dates", async (locale) => {
    const messages = { en, uk }[locale];
    translations.get.mockImplementation(async (namespace: "Legal.privacy" | "Legal.terms") => createTranslator({ locale, messages, namespace }));

    const privacy = renderToStaticMarkup(await PrivacyPage());
    const terms = renderToStaticMarkup(await TermsPage());
    const date = locale === "uk" ? "1 листопада 2026 року" : "November 1, 2026";

    for (const html of [privacy, terms]) {
      expect(html).toContain(`<time dateTime="2026-11-01">${date}</time>`);
      expect(html).toContain('href="mailto:studioflow.notifications@gmail.com"');
      expect(html).toContain("Meta");
      expect(html).not.toContain("&lt;email&gt;");
    }
    expect(privacy).toContain(`<h1 class=`);
    expect(privacy).toContain(messages.Legal.privacy.title);
    expect(terms).toContain(messages.Legal.terms.title);
    expect(privacy).toContain(messages.Legal.privacy.metaLeadAds.title);
    expect(privacy).toContain(messages.Legal.privacy.dataDeletion.bodyThree);
    expect(privacy).toContain('id="data-deletion"');
    expect(privacy).toContain('href="#data-deletion"');
    expect(privacy).toContain('href="https://developers.google.com/terms/api-services-user-data-policy"');
    expect(terms).toContain(messages.Legal.terms.integrations.bodyTwo);
    expect(terms).toContain('href="/privacy"');

    for (const [, target] of privacy.matchAll(/href="#([^"]+)"/g)) {
      expect(privacy).toContain(`id="${target}"`);
    }
  });
});
