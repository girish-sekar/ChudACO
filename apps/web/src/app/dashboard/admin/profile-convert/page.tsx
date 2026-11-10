import { redirect } from "next/navigation";
import ProfileConvertDashboard from "./ui";
import { auth } from "@/auth";
import { getAdminDiscordIds } from "@/lib/api-auth";

export default async function ProfileConvertPage() {
  const session = await auth();
  const discordId = session?.user?.discordId;

  if (!discordId) {
    redirect("/login");
  }

  if (!getAdminDiscordIds().has(discordId)) {
    redirect("/dashboard");
  }

  return <ProfileConvertDashboard />;
}
