// One-off: link accounts created/edited in classic mode (missing profile/IMAP/card links) to library entries.
// Usage (from apps/web): dotenv -e ../../.env -- tsx scripts/link-classic-accounts.ts [--user=<userId>] [--apply]
import { prisma } from "@chudaco/db";
import { linkClassicAccountToLibrary } from "@/lib/aco-library";

async function main() {
  const apply = process.argv.includes("--apply");
  const userId = process.argv.find((arg) => arg.startsWith("--user="))?.slice("--user=".length);
  const accounts = await prisma.acoAccount.findMany({
    where: {
      ...(userId ? { userId } : {}),
      OR: [
        { profileId: null, shippingAddr: { not: null } },
        { imapConfigId: null, email: { not: null }, imapHost: { not: null } },
        { cardId: null, cardOnFile: { isNot: null } },
        { retailerCards: { some: { cardId: null } } },
      ],
    },
    select: { id: true, botProfileName: true, profileId: true, imapConfigId: true, cardId: true },
    orderBy: [{ userId: "asc" }, { accountNumber: "asc" }],
  });

  console.log(apply ? "APPLYING" : "DRY RUN (pass --apply to write)");
  for (const account of accounts) {
    const missing = [!account.profileId && "profile", !account.imapConfigId && "imap", !account.cardId && "card"].filter(Boolean);
    if (!apply) {
      console.log(`  would link ${account.botProfileName} (unlinked: ${missing.join(", ") || "retailer cards"})`);
      continue;
    }
    const warning = await linkClassicAccountToLibrary(account.id, { force: true });
    console.log(`  linked ${account.botProfileName}${warning ? ` — ${warning}` : ""}`);
  }
  console.log(`${accounts.length} account(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
