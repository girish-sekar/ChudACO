const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const filename = path.join(__dirname, "target-account-split.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(source, context, { filename });

test("balances each owner's accounts with the odd remainder assigned to Valor", () => {
  const accounts = [
    { id: "one-1", userId: "one", accountNumber: 1 },
    { id: "two-2", userId: "two", accountNumber: 2 },
    { id: "two-1", userId: "two", accountNumber: 1 },
    { id: "three-3", userId: "three", accountNumber: 3 },
    { id: "three-1", userId: "three", accountNumber: 1 },
    { id: "three-2", userId: "three", accountNumber: 2 },
    { id: "four-4", userId: "four", accountNumber: 4 },
    { id: "four-2", userId: "four", accountNumber: 2 },
    { id: "four-1", userId: "four", accountNumber: 1 },
    { id: "four-3", userId: "four", accountNumber: 3 },
  ];
  const result = context.exports.splitTargetAccountsByOwner(accounts);

  assert.deepEqual(Array.from(result.valor, (account) => account.id), [
    "four-1", "four-2", "one-1", "three-1", "three-2", "two-1",
  ]);
  assert.deepEqual(Array.from(result.shikari, (account) => account.id), [
    "four-3", "four-4", "three-3", "two-2",
  ]);
});

test("keeps five profiles with Valor, then splits the remainder with ties to Valor", () => {
  const accounts = [];
  for (const [userId, count] of [["one", 1], ["five", 5], ["six", 6], ["seven", 7], ["nine", 9]]) {
    for (let accountNumber = 1; accountNumber <= count; accountNumber += 1) {
      accounts.push({ id: `${userId}-${accountNumber}`, userId, accountNumber });
    }
  }
  const result = context.exports.splitTargetProfilesByOwner(accounts);
  const accountsByOwner = (assigned) => {
    const grouped = {};
    for (const account of assigned) {
      (grouped[account.userId] ??= []).push(account.accountNumber);
    }
    return grouped;
  };

  assert.deepEqual(accountsByOwner(result.valor), {
    five: [1, 2, 3, 4, 5],
    nine: [1, 2, 3, 4, 5, 6, 7],
    one: [1],
    seven: [1, 2, 3, 4, 5, 6],
    six: [1, 2, 3, 4, 5, 6],
  });
  assert.deepEqual(accountsByOwner(result.shikari), {
    nine: [8, 9],
    seven: [7],
  });
});