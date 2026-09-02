import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument, legalLinkClassName } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service | StudioFlow",
  description: "Terms for using StudioFlow during its closed production-test and evolving beta stage.",
  alternates: { canonical: "https://studio-flow.space/terms" },
  robots: { index: true, follow: true },
};

export default async function TermsPage() {
  const t = await getTranslations("Legal.terms");

  return (
    <LegalDocument
      title={t("title")}
      lastUpdatedLabel={t("lastUpdatedLabel")}
      lastUpdatedDate={t("lastUpdatedDate")}
      introduction={t("introduction")}
      sections={[
        { title: t("acceptance.title"), paragraphs: [t("acceptance.body")] },
        { title: t("purpose.title"), paragraphs: [t("purpose.body")] },
        { title: t("beta.title"), paragraphs: [t("beta.body")] },
        { title: t("account.title"), paragraphs: [t("account.body")] },
        { title: t("permitted.title"), paragraphs: [t("permitted.body")] },
        { title: t("misuse.title"), paragraphs: [t("misuse.body")] },
        { title: t("content.title"), paragraphs: [t("content.body")] },
        { title: t("integrations.title"), paragraphs: [t("integrations.bodyOne"), t("integrations.bodyTwo")] },
        { title: t("availability.title"), paragraphs: [t("availability.body")] },
        { title: t("liability.title"), paragraphs: [t("liability.body")] },
        { title: t("termination.title"), paragraphs: [t("termination.body")] },
        { title: t("changes.title"), paragraphs: [t("changes.body")] },
        {
          title: t("contact.title"),
          paragraphs: [
            t.rich("contact.body", {
              email: (chunks) => (
                <a className={legalLinkClassName} href="mailto:studioflow.notifications@gmail.com">
                  {chunks}
                </a>
              ),
            }),
          ],
        },
      ]}
    />
  );
}
