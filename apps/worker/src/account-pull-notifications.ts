import { prisma } from "@chudaco/db";

type PullSummary = { retailer: string; accountNumber: number; exportType: string };
type SendDM = (discordId: string, content: string) => Promise<void>;

export function buildAccountPullMessage(pulls: PullSummary[], occurredAt: Date, baseUrl?: string): string {
  const retailers = new Map<string, Set<number>>();
  for (const pull of pulls) {
    const accounts = retailers.get(pull.retailer) ?? new Set<number>();
    accounts.add(pull.accountNumber);
    retailers.set(pull.retailer, accounts);
  }
  const lines = ["An admin pulled your ChudACO accounts.", `Exported: ${occurredAt.toISOString()}`];
  for (const [retailer, accounts] of retailers) {
    const safeName = retailer.replace(/[@*_`~<>\r\n]/g, "").slice(0, 80);
    const numbers = Array.from(accounts).sort((first, second) => first - second);
    const shown = numbers.slice(0, 15).map((number) => `#${number}`).join(", ");
    lines.push(`${safeName}: ${shown}${numbers.length > 15 ? ` (+${numbers.length - 15} more)` : ""}`);
  }
  const types = Array.from(new Set(pulls.map((pull) => pull.exportType === "imap" ? "IMAP" : pull.exportType)));
  lines.push(`Included: ${types.join(", ")}.`);
  let link = "";
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (["https:", "http:"].includes(url.protocol)) link = `\nAccounts: ${url.origin}/dashboard/accounts`;
    } catch {}
  }
  return `${lines.join("\n").slice(0, 1700)}${link.slice(0, 200)}`;
}

export async function processAccountPullNotifications(send: SendDM, db = prisma, now = new Date()): Promise<void> {
  const expiredLease = new Date(now.getTime() - 5 * 60_000);
  await db.accountPullNotification.updateMany({
    where: { status: "sending", lockedAt: { lt: expiredLease } },
    data: { status: "pending", lockedAt: null },
  });
  const jobs = await db.accountPullNotification.findMany({
    where: {
      status: "pending", availableAt: { lte: now },
      export: { OR: [{ completedAt: { not: null } }, { createdAt: { lte: new Date(now.getTime() - 2 * 60_000) } }] },
    },
    orderBy: { availableAt: "asc" }, take: 20,
    select: { id: true },
  });
  for (const candidate of jobs) {
    const claimed = await db.accountPullNotification.updateMany({
      where: { id: candidate.id, status: "pending", availableAt: { lte: now } },
      data: { status: "sending", lockedAt: now, attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    const job = await db.accountPullNotification.findUnique({
      where: { id: candidate.id },
      include: {
        user: { select: { discordId: true, notifyOnAccountPull: true, discordAccessStatus: true } },
        export: { include: { pulls: { select: { userId: true, retailer: true, accountNumber: true, exportType: true } } } },
      },
    });
    if (!job) continue;
    const pulls = job.export.pulls.filter((pull) => pull.userId === job.userId);
    if (!job.user.notifyOnAccountPull || job.user.discordAccessStatus !== "active" || !pulls.length) {
      await db.accountPullNotification.update({ where: { id: job.id }, data: { status: "skipped", lockedAt: null } });
      continue;
    }
    try {
      if (job.attempts > 5) throw { code: "RETRY_LIMIT" };
      await send(job.user.discordId, buildAccountPullMessage(pulls, job.export.createdAt, process.env.AUTH_URL ?? process.env.NEXTAUTH_URL));
    } catch (error) {
      const code = (error as { code?: number | string }).code;
      const permanent = [50007, 50013, 10013].includes(Number(code)) || job.attempts >= 5;
      await db.accountPullNotification.update({
        where: { id: job.id },
        data: {
          status: permanent ? "failed" : "pending", lockedAt: null,
          availableAt: new Date(now.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** job.attempts)),
          lastError: permanent ? "Discord DM unavailable or retry limit reached." : "Temporary Discord DM delivery failure.",
        },
      });
      continue;
    }
    await db.accountPullNotification.update({
      where: { id: job.id }, data: { status: "sent", sentAt: new Date(), lockedAt: null, lastError: null },
    });
  }
}

export function startAccountPullNotificationWorker(send: SendDM): void {
  let running = false;
  const cycle = async () => {
    if (running) return;
    running = true;
    try {
      await processAccountPullNotifications(send);
    } catch {
      console.error("[account-pulls] Notification queue cycle failed.");
    } finally {
      running = false;
    }
  };
  void cycle();
  setInterval(() => void cycle(), 15_000);
}