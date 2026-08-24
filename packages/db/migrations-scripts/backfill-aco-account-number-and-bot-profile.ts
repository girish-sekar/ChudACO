import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Summary = {
  usersScanned: number;
  accountsUpdated: number;
  usersWithAccounts: number;
  usersCounterUpdated: number;
  collisionsDetected: number;
};

async function runBackfill(): Promise<void> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      acoAccounts: {
        // AcoAccount rows historically have no createdAt, and CUIDs are time-sortable.
        // We use ascending id as the best available proxy for creation order.
        orderBy: [{ id: "asc" }],
        select: {
          id: true,
          accountNumber: true,
          botProfileName: true,
        },
      },
    },
  });

  const summary: Summary = {
    usersScanned: users.length,
    accountsUpdated: 0,
    usersWithAccounts: 0,
    usersCounterUpdated: 0,
    collisionsDetected: 0,
  };

  const seenProfiles = new Set<string>();

  for (const user of users) {
    if (user.acoAccounts.length === 0) {
      continue;
    }

    summary.usersWithAccounts += 1;

    let nextNumber = 1;

    for (const account of user.acoAccounts) {
      const accountNumber = nextNumber;
      const botProfileName = `${user.username} - ACO #${accountNumber}`;

      if (seenProfiles.has(botProfileName)) {
        summary.collisionsDetected += 1;
        throw new Error(`botProfileName collision detected during backfill: ${botProfileName}`);
      }
      seenProfiles.add(botProfileName);

      const existing = await prisma.acoAccount.findFirst({
        where: {
          botProfileName,
          NOT: { id: account.id },
        },
        select: { id: true },
      });

      if (existing) {
        summary.collisionsDetected += 1;
        throw new Error(
          `botProfileName collision with existing account: ${botProfileName} (existing=${existing.id}, current=${account.id})`,
        );
      }

      await prisma.acoAccount.update({
        where: { id: account.id },
        data: {
          accountNumber,
          botProfileName,
        },
      });

      summary.accountsUpdated += 1;
      nextNumber += 1;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        nextAcoAccountNumber: nextNumber,
      },
    });

    summary.usersCounterUpdated += 1;
  }

  console.log("Backfill complete");
  console.log(`Users scanned: ${summary.usersScanned}`);
  console.log(`Users with accounts: ${summary.usersWithAccounts}`);
  console.log(`Accounts updated: ${summary.accountsUpdated}`);
  console.log(`Users counter updated: ${summary.usersCounterUpdated}`);
  console.log(`Collisions detected: ${summary.collisionsDetected}`);
}

runBackfill()
  .catch((error) => {
    console.error("Backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
