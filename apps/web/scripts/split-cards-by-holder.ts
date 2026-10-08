// One-off: split library cards that were shared across accounts with different cardholder names.
// Usage (from apps/web): dotenv -e ../../.env -- tsx scripts/split-cards-by-holder.ts [--apply]
import { prisma } from "@chudaco/db";
import { importExistingAccountCards } from "@/lib/aco-library";

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

async function main() {
  const apply = process.argv.includes("--apply");
  const [defaults, retailerCards] = await Promise.all([
    prisma.acoAccount.findMany({
      where: { cardId: { not: null }, cardOnFile: { isNot: null } },
      select: { id: true, userId: true, botProfileName: true, card: { select: { cardholderName: true } }, cardOnFile: { select: { cardholderName: true } } },
    }),
    prisma.acoRetailerCard.findMany({
      where: { cardId: { not: null } },
      select: { id: true, retailer: true, cardholderName: true, card: { select: { cardholderName: true } }, acoAccount: { select: { userId: true, botProfileName: true } } },
    }),
  ]);

  const badDefaults = defaults.filter((a) => a.card && norm(a.card.cardholderName) !== norm(a.cardOnFile?.cardholderName));
  const badRetailer = retailerCards.filter((c) => c.card && norm(c.card.cardholderName) !== norm(c.cardholderName));

  console.log(apply ? "APPLYING" : "DRY RUN (pass --apply to write)");
  for (const a of badDefaults) console.log(`  ${a.botProfileName} default: library "${a.card?.cardholderName}" vs account "${a.cardOnFile?.cardholderName}"`);
  for (const c of badRetailer) console.log(`  ${c.acoAccount.botProfileName} ${c.retailer}: library "${c.card?.cardholderName}" vs account "${c.cardholderName}"`);
  if (!apply || (!badDefaults.length && !badRetailer.length)) return;

  await prisma.$transaction([
    prisma.acoAccount.updateMany({ where: { id: { in: badDefaults.map((a) => a.id) } }, data: { cardId: null } }),
    prisma.acoRetailerCard.updateMany({ where: { id: { in: badRetailer.map((c) => c.id) } }, data: { cardId: null } }),
  ]);
  const userIds = Array.from(new Set([...badDefaults.map((a) => a.userId), ...badRetailer.map((c) => c.acoAccount.userId)]));
  const result = await importExistingAccountCards(userIds);
  console.log(`created ${result.created}, linked ${result.linked}, skipped ${result.skipped.length}`);
  for (const reason of result.skipped) console.log(`  skipped ${reason}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
