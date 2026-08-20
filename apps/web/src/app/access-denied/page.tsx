import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Access denied</h1>
          <p className="mt-3 text-sm text-slate-600">
            Your Discord account is authenticated, but you do not currently have the Cop Access
            role in ChudACO HQ.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Join the server or contact an admin to receive the role, then try signing in again.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}