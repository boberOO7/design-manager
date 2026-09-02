import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument, legalLinkClassName } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy | StudioFlow",
  description: "How StudioFlow collects, uses, stores, and protects account, workspace, and Google Calendar integration data.",
  alternates: { canonical: "https://studio-flow.space/privacy" },
  robots: { index: true, follow: true },
};

export default async function PrivacyPage() {
  const t = await getTranslations("Legal.privacy");

  return (
    <LegalDocument
      title={t("title")}
      lastUpdatedLabel={t("lastUpdatedLabel")}
      lastUpdatedDate={t("lastUpdatedDate")}
      introduction={t("introduction")}
      sections={[
        {
          title: t("service.title"),
          paragraphs: [t("service.body")],
        },
        {
          title: t("accountData.title"),
          paragraphs: [t("accountData.body")],
        },
        {
          title: t("workspaceData.title"),
          paragraphs: [t("workspaceData.body")],
        },
        {
          title: t("googleAccess.title"),
          paragraphs: [t("googleAccess.bodyOne"), t("googleAccess.bodyTwo")],
        },
        {
          title: t("googleUse.title"),
          paragraphs: [t("googleUse.bodyOne"), t("googleUse.bodyTwo")],
        },
        {
          title: t("credentials.title"),
          paragraphs: [t("credentials.body")],
        },
        {
          title: t("disconnect.title"),
          paragraphs: [t("disconnect.body")],
        },
        {
          title: t("limitedUse.title"),
          paragraphs: [
            t.rich("limitedUse.body", {
              policy: (chunks) => (
                <a
                  className={legalLinkClassName}
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  rel="noreferrer"
                  target="_blank"
                >
                  {chunks}
                </a>
              ),
            }),
          ],
        },
        {
          title: t("retention.title"),
          paragraphs: [t("retention.body")],
        },
        {
          title: t("security.title"),
          paragraphs: [t("security.body")],
        },
        {
          title: t("providers.title"),
          paragraphs: [t("providers.body")],
        },
        {
          title: t("updates.title"),
          paragraphs: [t("updates.body")],
        },
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
