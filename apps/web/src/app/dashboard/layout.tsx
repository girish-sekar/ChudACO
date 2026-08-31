import type { ReactNode } from "react";
import { auth, signOut } from "@/auth";
import { DashboardNav } from "@/components/dashboard/nav";

function isAdminDiscordId(discordId: string | undefined): boolean {
  if (!discordId) return false;
  return (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(discordId);
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const isAdmin = isAdminDiscordId(session?.user?.discordId);
  return (
    <main className="min-h-screen bg-[#101014] text-[#F2F1F6]">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:flex-row md:px-6">
        <aside className="h-fit rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4 md:sticky md:top-6 md:w-64">
          <p className="font-heading text-2xl font-bold text-[#F2F1F6]">ChudACO</p>
          <p className="mt-1 text-xs text-[#605E72]">Discord-gated dashboard</p>
          <DashboardNav isAdmin={isAdmin} />
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] transition hover:text-[#F2F1F6]"
            >
              Sign out
            </button>
          </form>
        </aside>
        <section className="flex-1">{children}</section>
      </div>
    </main>
  );
}