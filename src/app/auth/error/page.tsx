import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-stone-500">StudioFlow</p>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900">Email link unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-stone-600">
          This email link is invalid, expired, or has already been used. Request a new password link to continue.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/forgot-password"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Request password link
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            Return to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
