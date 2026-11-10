import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@chudaco/db";
import { buildAccountPullMessage, processAccountPullNotifications } from "./account-pull-notifications";

function setup() {
  const now = new Date("2026-11-08T12:00:00Z");
  const job = {
    id: "job", userId: "u1", status: "pending", attempts: 0, availableAt: now,
    user: { discordId: "discord-u1", notifyOnAccountPull: true, discordAccessStatus: "active" },
    export: { createdAt: now, pulls: [
      { userId: "u1", retailer: "Target", accountNumber: 1, exportType: "accounts" },
      { userId: "u1", retailer: "Target", accountNumber: 1, exportType: "imap" },
      { userId: "u2", retailer: "Costco", accountNumber: 999, exportType: "accounts" },
    ] },
  };
  const state = { job, sent: [] as string[], queries: [] as unknown[], claimed: true };
  const db = { accountPullNotification: {
    findMany: async (query: unknown) => { state.queries.push(query); return job.status === "pending" && job.availableAt <= now ? [{ id: job.id }] : []; },
    updateMany: async ({ where, data }: { where: { id?: string }; data: { status: string } }) => {
      if (!where.id || !state.claimed) return { count: 0 };
      job.status = data.status;
      job.attempts += 1;
      return { count: 1 };
    },
    findUnique: async () => job,
    update: async ({ data }: { data: object }) => Object.assign(job, data),
  } } as unknown as typeof prisma;
  const send = async (discordId: string, content: string) => { assert.equal(discordId, "discord-u1"); state.sent.push(content); };
  return { state, now, db, send };
}

test("one DM groups accounts and export types without another user's accounts", async () => {
  const { state, now, db, send } = setup();
  await processAccountPullNotifications(send, db, now);
  await processAccountPullNotifications(send, db, now);
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].match(/#1/g)?.length, 1);
  assert.ok(!state.sent[0].includes("999"));
  assert.equal(state.job.status, "sent");
});

test("opted-out and access-revoked users are skipped", async () => {
  for (const access of ["active", "grace"]) {
    const { state, now, db, send } = setup();
    state.job.user.notifyOnAccountPull = access !== "active";
    state.job.user.discordAccessStatus = access;
    await processAccountPullNotifications(send, db, now);
    assert.equal(state.sent.length, 0);
    assert.equal(state.job.status, "skipped");
  }
});

test("blocked DMs stop retrying; transient errors get a delayed retry", async () => {
  for (const code of [50007, 503]) {
    const { state, now, db } = setup();
    await processAccountPullNotifications(async () => { throw { code }; }, db, now);
    assert.equal(state.job.status, code === 50007 ? "failed" : "pending");
    assert.ok(state.job.availableAt > now);
  }
});

test("a job claimed by another worker is not sent", async () => {
  const { state, now, db, send } = setup();
  state.claimed = false;
  await processAccountPullNotifications(send, db, now);
  assert.equal(state.sent.length, 0);
});

test("DM messages are bounded and contain an Accounts link", () => {
  const pulls = Array.from({ length: 500 }, (_, index) => ({ retailer: "@everyone **Target**", accountNumber: index, exportType: "profiles" }));
  const message = buildAccountPullMessage(pulls, new Date("2026-11-08"), "https://chudaco.test/api/auth");
  assert.ok(message.length < 2000);
  assert.ok(!message.includes("@everyone"));
  assert.ok(message.includes("https://chudaco.test/dashboard/accounts"));
});