import type { ReactNode } from "react";

type LegalSection = {
  title: string;
  paragraphs: ReactNode[];
};

type LegalDocumentProps = {
  title: string;
  lastUpdatedLabel: string;
  lastUpdatedDate: string;
  introduction: ReactNode;
  sections: LegalSection[];
};

export const legalLinkClassName =
  "font-medium text-[var(--ui-text)] underline decoration-[var(--ui-border-strong)] underline-offset-4 transition-colors hover:decoration-current focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ui-focus)]";

export function LegalDocument({
  title,
  lastUpdatedLabel,
  lastUpdatedDate,
  introduction,
  sections,
}: LegalDocumentProps) {
  return (
    <article className="mx-auto w-full max-w-[72ch] px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
      <header className="border-b border-[var(--ui-border)] pb-8">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-[var(--ui-text-muted)]">
          {lastUpdatedLabel}: <time dateTime="2026-09-02">{lastUpdatedDate}</time>
        </p>
        <div className="mt-6 text-lg leading-8 text-[var(--ui-text-muted)]">{introduction}</div>
      </header>

      <div className="mt-10 space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold tracking-[-0.0125em] text-[var(--ui-text)]">
              {section.title}
            </h2>
            <div className="mt-3 space-y-4 text-base leading-7 text-[var(--ui-text-muted)]">
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
