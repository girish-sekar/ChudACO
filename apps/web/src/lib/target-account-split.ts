export type TargetAccountForSplit = {
  id: string;
  userId: string;
  accountNumber: number;
};

export function splitTargetAccountsByOwner<T extends TargetAccountForSplit>(accounts: T[]) {
  const grouped = new Map<string, T[]>();
  for (const account of accounts) {
    const ownerAccounts = grouped.get(account.userId) ?? [];
    ownerAccounts.push(account);
    grouped.set(account.userId, ownerAccounts);
  }

  const valor: T[] = [];
  const shikari: T[] = [];
  for (const ownerId of Array.from(grouped.keys()).sort()) {
    const ownerAccounts = grouped.get(ownerId)!;
    ownerAccounts.sort((first, second) =>
      first.accountNumber - second.accountNumber || first.id.localeCompare(second.id),
    );
    const valorCount = Math.ceil(ownerAccounts.length / 2);
    valor.push(...ownerAccounts.slice(0, valorCount));
    shikari.push(...ownerAccounts.slice(valorCount));
  }

  return { valor, shikari };
}

export function splitTargetProfilesByOwner<T extends TargetAccountForSplit>(accounts: T[]) {
  const grouped = new Map<string, T[]>();
  for (const account of accounts) {
    const ownerAccounts = grouped.get(account.userId) ?? [];
    ownerAccounts.push(account);
    grouped.set(account.userId, ownerAccounts);
  }

  const valor: T[] = [];
  const shikari: T[] = [];
  for (const ownerId of Array.from(grouped.keys()).sort()) {
    const ownerAccounts = grouped.get(ownerId)!;
    ownerAccounts.sort((first, second) =>
      first.accountNumber - second.accountNumber || first.id.localeCompare(second.id),
    );
    const valorCount = ownerAccounts.length <= 5
      ? ownerAccounts.length
      : 5 + Math.ceil((ownerAccounts.length - 5) / 2);
    valor.push(...ownerAccounts.slice(0, valorCount));
    shikari.push(...ownerAccounts.slice(valorCount));
  }

  return { valor, shikari };
}