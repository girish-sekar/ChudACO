import { prisma } from "@chudaco/db";
import { redirect } from "next/navigation";
import EmailExportDashboard from "./ui";
import { auth } from "@/auth";
import { getAdminDiscordIds } from "@/lib/api-auth";

export default async function EmailExportPage() {
  const session = await auth();
  const discordId = session?.user?.discordId;

  if (!discordId) {
    redirect("/login");
  }

  if (!getAdminDiscordIds().has(discordId)) {
    redirect("/dashboard");
  }

  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true },
  });

  if (!user) {
    redirect("/dashboard");
  }

  return <EmailExportDashboard />;
}
