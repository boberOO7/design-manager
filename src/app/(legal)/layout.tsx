import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StudioFlowMark } from "@/components/brand/studioflow-mark";
import { LanguageSelector } from "@/components/layout/language-selector";
import { ThemeSwitch } from "@/components/layout/theme-switch";

export default async function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("Legal.navigation");

  return (
    <div className="min-h-dvh bg-[var(--ui-page)] lg:h-dvh lg:overflow-y-auto">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-[var(--ui-text)] px-4 py-2 text-sm font-medium text-[var(--ui-page)] shadow-lg transition-transform focus:translate-y-0 focus:outline-none"
      >
        {t("skipToContent")}
      </a>

      <header className="border-b border-[var(--ui-border)] bg-[var(--ui-surface)]">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 px-4 py-2 sm:flex-nowrap sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label={t("homeLabel")}
            className="flex min-h-11 items-center gap-2 rounded-md font-semibold tracking-[-0.02em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ui-focus)]"
          >
            <StudioFlowMark className="h-7" />
            <span>StudioFlow</span>
          </Link>

          <nav
            aria-label={t("legalNavigation")}
            className="order-3 flex w-full items-center gap-1 border-t border-[var(--ui-border)] pt-2 sm:order-none sm:w-auto sm:border-0 sm:pt-0"
          >
            <Link
              href="/privacy"
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              {t("privacy")}
            </Link>
            <Link
              href="/terms"
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              {t("terms")}
            </Link>
          </nav>

          <div className="flex items-center gap-1">
            <LanguageSelector />
            <ThemeSwitch />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {children}
      </main>

      <footer className="border-t border-[var(--ui-border)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-[var(--ui-text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>© 2026 StudioFlow</span>
          <a
            href="mailto:studioflow.notifications@gmail.com"
            className="rounded-sm underline decoration-[var(--ui-border-strong)] underline-offset-4 hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ui-focus)]"
          >
            studioflow.notifications@gmail.com
          </a>
        </div>
      </footer>
    </div>
  );
}
