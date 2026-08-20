import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Sign in to ChudACO</h1>
          <p className="mt-3 text-sm text-slate-600">
            Continue with Discord to access your dashboard. This requires the Cop Access role in
            ChudACO HQ.
          </p>

          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: "/dashboard" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105"
            >
              Continue with Discord
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}