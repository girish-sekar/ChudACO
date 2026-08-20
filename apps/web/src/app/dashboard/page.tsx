import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.hasRequiredRole) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-3 text-sm text-slate-600">
            Logged in as <span className="font-medium text-slate-900">{session.user.name}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Cop Access role status:{" "}
            <span className="font-medium text-emerald-700">verified</span>
          </p>
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}