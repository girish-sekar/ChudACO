import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type BackfillSummary = {
  usersScanned: number;
  usersWithShipping: number;
  accountsUpdated: number;
};

function hasAnyShippingField(user: {
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddr: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
}): boolean {
  return Boolean(
    user.shippingName ||
      user.shippingPhone ||
      user.shippingAddr ||
      user.shippingCity ||
      user.shippingState ||
      user.shippingZip,
  );
}

async function runBackfill(): Promise<void> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      shippingName: true,
      shippingPhone: true,
      shippingAddr: true,
      shippingCity: true,
      shippingState: true,
      shippingZip: true,
    },
  });

  const summary: BackfillSummary = {
    usersScanned: users.length,
    usersWithShipping: 0,
    accountsUpdated: 0,
  };

  for (const user of users) {
    if (!hasAnyShippingField(user)) {
      continue;
    }

    summary.usersWithShipping += 1;

    const updateResult = await prisma.acoAccount.updateMany({
      where: { userId: user.id },
      data: {
        shippingName: user.shippingName,
        shippingPhone: user.shippingPhone,
        shippingAddr: user.shippingAddr,
        shippingCity: user.shippingCity,
        shippingState: user.shippingState,
        shippingZip: user.shippingZip,
      },
    });

    summary.accountsUpdated += updateResult.count;
  }

  console.log("Backfill complete");
  console.log(`Users scanned: ${summary.usersScanned}`);
  console.log(`Users with shipping data: ${summary.usersWithShipping}`);
  console.log(`AcoAccount rows updated: ${summary.accountsUpdated}`);
}

runBackfill()
  .catch((error) => {
    console.error("Backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
