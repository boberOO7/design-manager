import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ui-surface-muted)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ui-text-muted)]">StudioFlow</p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--ui-text)]">Recover your password</h1>
        <p className="mt-2 text-sm text-[var(--ui-text-secondary)]">
          Enter your employee email to request a secure password setup link.
        </p>
        <ForgotPasswordForm />
        <p className="mt-5 text-center text-sm text-[var(--ui-text-muted)]">
          <Link href="/login" className="font-medium text-[var(--ui-text)] underline underline-offset-4">
            Return to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
