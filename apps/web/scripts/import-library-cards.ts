// One-off: move pre-library account cards (default + retailer-specific) into the card library for all users.
// Usage (from apps/web): dotenv -e ../../.env -- tsx scripts/import-library-cards.ts [--apply]
import { prisma } from "@chudaco/db";
import { importExistingAccountCards } from "@/lib/aco-library";

async function main() {
  const apply = process.argv.includes("--apply");
  const result = await importExistingAccountCards(undefined, { dryRun: !apply });
  console.log(apply ? "APPLIED" : "DRY RUN (pass --apply to write)");
  console.log(`cards to create: ${result.created}, account cards to link: ${result.linked}, skipped: ${result.skipped.length}`);
  for (const reason of result.skipped) console.log(`  skipped ${reason}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
