import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ui-surface-muted)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ui-text-muted)]">StudioFlow</p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--ui-text)]">Email link unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-[var(--ui-text-secondary)]">
          This email link is invalid, expired, or has already been used. Request a new password link to continue.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/forgot-password"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--ui-action-primary)] px-4 text-sm font-semibold text-[var(--ui-action-primary-text)] transition hover:bg-[var(--ui-action-primary-hover)]"
          >
            Request password link
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-4 text-sm font-semibold text-[var(--ui-text-secondary)] transition hover:bg-[var(--ui-surface-subtle)]"
          >
            Return to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
