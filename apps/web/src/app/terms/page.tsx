import { redirect } from "next/navigation";
import { prisma } from "@chudaco/db";
import { auth } from "@/auth";
import { TermsContent } from "@/components/terms-content";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

export default async function TermsAcceptancePage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const session = await auth();
  const discordId = session?.user?.discordId;

  if (!discordId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true, termsVersion: true },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.termsVersion === CURRENT_TERMS_VERSION) {
    redirect("/dashboard");
  }

  async function acceptTerms(formData: FormData) {
    "use server";

    if (formData.get("agree") !== "on") {
      redirect("/terms?error=agreement-required");
    }

    const currentSession = await auth();
    const currentDiscordId = currentSession?.user?.discordId;

    if (!currentDiscordId) {
      redirect("/login");
    }

    await prisma.user.updateMany({
      where: { discordId: currentDiscordId },
      data: {
        termsVersion: CURRENT_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
    });

    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#101014] px-4 py-8 text-[#F2F1F6] md:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 border-b border-[#2C2D3A] pb-5">
          <p className="font-mono text-xs uppercase text-[#FFCB3C]">ChudACO Account</p>
          <h1 className="mt-2 font-heading text-3xl font-bold">Review and accept the terms</h1>
          <p className="mt-2 max-w-[68ch] text-sm text-[#9C9AAE]">
            You need to accept the current Terms & Conditions to continue to your account.
          </p>
        </header>

        <div className="rounded-lg border border-[#2C2D3A] bg-[#18181F] p-5 md:p-8">
          <TermsContent />
          <form action={acceptTerms} className="pt-6">
            <label className="flex max-w-[68ch] items-start gap-3 text-sm text-[#D7D6E4]">
              <input
                required
                type="checkbox"
                name="agree"
                className="mt-1 h-4 w-4 accent-[#FFCB3C]"
              />
              <span>I have read and agree to the ChudACO Terms & Conditions above.</span>
            </label>
            {searchParams?.error === "agreement-required" ? (
              <p role="alert" className="mt-3 text-sm text-[#FF5D5D]">
                Check the box to confirm your agreement before continuing.
              </p>
            ) : null}
            <button
              type="submit"
              className="mt-5 rounded-md bg-[#FFCB3C] px-4 py-2.5 text-sm font-semibold text-[#171717] transition hover:brightness-110"
            >
              Agree and continue
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}