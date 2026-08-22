import { prisma } from "@chudaco/db";
import { redirect } from "next/navigation";
import AdminDashboard from "./ui";
import { auth } from "@/auth";

function isAdmin(discordId: string | undefined): boolean {
  if (!discordId) {
    return false;
  }

  const admins = new Set(
    (process.env.ADMIN_DISCORD_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

  return admins.has(discordId);
}

export default async function AdminPage() {
  const session = await auth();
  const discordId = session?.user?.discordId;

  if (!discordId) {
    redirect("/login");
  }

  if (!isAdmin(discordId)) {
    redirect("/dashboard");
  }

  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true },
  });

  if (!user) {
    redirect("/dashboard");
  }

  return <AdminDashboard />;
}
