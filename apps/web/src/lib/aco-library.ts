import { prisma } from "@chudaco/db";
import { z } from "zod";
import {
  appendCardVaultRows,
  deleteGoogleSheetRowsForAccount,
  getAllCardVaultRows,
  getMainSheetRows,
  upsertGoogleSheetAccountRow,
  upsertGoogleSheetShippingFields,
  type CardVaultEntry,
} from "@/lib/google-sheets-relay";
import { normalizeCardBrand } from "@/lib/card-brand";
import { buildAccountCardSheetRow, getCardLast4, normalizeExpirationYear, sheetAccountSelect } from "@/lib/payment-info";
import { findSheetCardRow } from "@/lib/sheet-card";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  shippingName: optionalText(200),
  shippingPhone: optionalText(50),
  shippingAddr: optionalText(300),
  shippingCity: optionalText(120),
  shippingState: optionalText(120),
  shippingZip: optionalText(30),
  billingSameAsShipping: z.boolean().optional(),
  billingName: optionalText(200),
  billingPhone: optionalText(50),
  billingAddr: optionalText(300),
  billingCity: optionalText(120),
  billingState: optionalText(120),
  billingZip: optionalText(30),
});

export const imapConfigSchema = z.object({
  email: z.string().trim().email(),
  emailProvider: optionalText(120),
  imapHost: z.string().trim().min(1).max(255),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapSecurity: z.string().trim().min(1).max(40).optional(),
  password: z.string().optional(),
});

export const cardLabelSchema = z.string().trim().min(1).max(120);

export const linkedAccountsSelect = {
  accounts: { select: { id: true, accountNumber: true, label: true }, orderBy: { accountNumber: "asc" as const } },
};

export const profileInclude = {
  ...linkedAccountsSelect,
  retailerProfiles: {
    select: { retailer: true, acoAccount: { select: { id: true, accountNumber: true, label: true } } },
    orderBy: { retailer: "asc" as const },
  },
};

export const cardInclude = {
  ...linkedAccountsSelect,
  retailerCards: {
    select: { retailer: true, acoAccount: { select: { id: true, accountNumber: true, label: true } } },
    orderBy: { retailer: "asc" as const },
  },
};

type ProfileValues = z.infer<typeof profileSchema>;

export function normalizeProfile(input: ProfileValues) {
  const same = input.billingSameAsShipping ?? true;
  return {
    name: input.name,
    shippingName: input.shippingName || null,
    shippingPhone: input.shippingPhone || null,
    shippingAddr: input.shippingAddr || null,
    shippingCity: input.shippingCity || null,
    shippingState: input.shippingState || null,
    shippingZip: input.shippingZip || null,
    billingSameAsShipping: same,
    billingName: same ? null : input.billingName || null,
    billingPhone: same ? null : input.billingPhone || null,
    billingAddr: same ? null : input.billingAddr || null,
    billingCity: same ? null : input.billingCity || null,
    billingState: same ? null : input.billingState || null,
    billingZip: same ? null : input.billingZip || null,
  };
}

type ProfileRecord = Omit<ReturnType<typeof normalizeProfile>, "name">;

/** For exports: swaps in the account's retailer-specific profile, if one is linked for this retailer. */
export function withRetailerProfile<T extends { retailerProfiles: Array<{ retailer: string; profile: ProfileRecord }> }>(
  account: T,
  retailer: string | null | undefined,
): T {
  const override = retailer
    ? account.retailerProfiles.find((entry) => entry.retailer.toLowerCase() === retailer.trim().toLowerCase())
    : undefined;
  return override ? { ...account, ...profileAccountData(override.profile) } : account;
}

export function profileAccountData(profile: ProfileRecord | null) {
  return {
    shippingName: profile?.shippingName ?? null,
    shippingPhone: profile?.shippingPhone ?? null,
    shippingAddr: profile?.shippingAddr ?? null,
    shippingCity: profile?.shippingCity ?? null,
    shippingState: profile?.shippingState ?? null,
    shippingZip: profile?.shippingZip ?? null,
    billingSameAsShipping: profile?.billingSameAsShipping ?? true,
    billingName: profile?.billingName ?? null,
    billingPhone: profile?.billingPhone ?? null,
    billingAddr: profile?.billingAddr ?? null,
    billingCity: profile?.billingCity ?? null,
    billingState: profile?.billingState ?? null,
    billingZip: profile?.billingZip ?? null,
  };
}

type ImapRecord = {
  email: string;
  emailProvider: string | null;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  encryptedPassword: string | null;
  encryptionIv: string | null;
};

export function imapAccountData(imap: ImapRecord | null) {
  return {
    email: imap?.email ?? null,
    emailProvider: imap?.emailProvider ?? null,
    imapHost: imap?.imapHost ?? null,
    imapPort: imap?.imapPort ?? 993,
    imapSecurity: imap?.imapSecurity ?? "SSL/TLS",
    encryptedPassword: imap?.encryptedPassword ?? null,
    encryptionIv: imap?.encryptionIv ?? null,
  };
}

export function sanitizeImapConfig<T extends ImapRecord & { id: string }>(config: T) {
  const { encryptedPassword, encryptionIv, ...rest } = config;
  return { ...rest, passwordSet: Boolean(encryptedPassword && encryptionIv) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Google Sheets error";
}

/** Re-syncs the shipping/billing columns of an account's sheet rows. Returns a warning on failure. */
export async function syncAccountSheet(accountId: string): Promise<string | null> {
  const account = await prisma.acoAccount.findUnique({ where: { id: accountId }, select: sheetAccountSelect });
  if (!account) return null;

  try {
    const { id, ...fields } = account;
    await upsertGoogleSheetShippingFields({ accountId: id, ...fields });
    return null;
  } catch (error) {
    return `Google Sheets sync failed for account: ${errorMessage(error)}`;
  }
}

type CardRecord = { id: string; cardholderName: string; cardBrand: string; last4: string; expMonth: number; expYear: number };

/**
 * Writes a library card to an account as its default card (retailer null) or a retailer-specific card:
 * sheet row + masked CardOnFile/AcoRetailerCard. Throws on sheet failure.
 */
export async function relayCardToAccount(accountId: string, card: CardRecord, vault: CardVaultEntry, retailer: string | null = null) {
  const account = await prisma.acoAccount.findUniqueOrThrow({ where: { id: accountId }, select: sheetAccountSelect });
  const details = {
    cardholderName: card.cardholderName,
    cardBrand: card.cardBrand,
    cardNumber: vault.cardNumber,
    expMonth: card.expMonth,
    expYear: card.expYear,
    cvv: vault.cvv,
  };

  await upsertGoogleSheetAccountRow(account.id, buildAccountCardSheetRow(account, details, retailer));

  const masked = {
    cardBrand: card.cardBrand,
    last4: getCardLast4(vault.cardNumber),
    expMonth: card.expMonth,
    expYear: card.expYear,
    cardholderName: card.cardholderName,
  };

  if (retailer === null) {
    await prisma.cardOnFile.upsert({
      where: { acoAccountId: account.id },
      update: masked,
      create: { acoAccountId: account.id, ...masked },
    });
    return;
  }

  const existing = await prisma.acoRetailerCard.findFirst({
    where: { acoAccountId: account.id, retailer: { equals: retailer, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    await prisma.acoRetailerCard.update({ where: { id: existing.id }, data: { ...masked, cardId: card.id } });
  } else {
    await prisma.acoRetailerCard.create({ data: { acoAccountId: account.id, retailer, cardId: card.id, ...masked } });
  }
}

export async function removeCardFromAccount(accountId: string, retailer: string | null) {
  await deleteGoogleSheetRowsForAccount(accountId, retailer);
  if (retailer === null) {
    await prisma.cardOnFile.deleteMany({ where: { acoAccountId: accountId } });
  } else {
    await prisma.acoRetailerCard.deleteMany({
      where: { acoAccountId: accountId, retailer: { equals: retailer, mode: "insensitive" } },
    });
  }
}

/**
 * Classic edits only write the account's own columns; mirror them into library entries (profile, IMAP inbox,
 * cards) so modular view sees the account as linked. Returns a warning if card import fails.
 */
export async function linkClassicAccountToLibrary(accountId: string, { force = false } = {}): Promise<string | null> {
  const account = await prisma.acoAccount.findUnique({
    where: { id: accountId },
    include: {
      user: { select: { accountManagementMode: true } },
      profile: { include: { _count: { select: { accounts: true } } } },
      imapConfig: { select: { id: true, email: true } },
      cardOnFile: { select: { id: true } },
      retailerCards: { where: { cardId: null }, select: { id: true } },
    },
  });
  // Modular saves follow up with an explicit links update, which this must not pre-empt.
  if (!account || (!force && account.user.accountManagementMode !== "classic")) return null;

  const shipping = profileAccountData(account);
  const hasShipping = [shipping.shippingName, shipping.shippingPhone, shipping.shippingAddr, shipping.shippingCity, shipping.shippingState, shipping.shippingZip].some(Boolean);
  if (!hasShipping) {
    if (account.profileId) await prisma.acoAccount.update({ where: { id: account.id }, data: { profileId: null } });
  } else if (account.profile && account.profile._count.accounts === 1) {
    await prisma.acoProfile.update({ where: { id: account.profile.id }, data: shipping });
  } else if (!account.profile || JSON.stringify(profileAccountData(account.profile)) !== JSON.stringify(shipping)) {
    // A shared profile is left untouched for the other accounts; this account gets its own.
    const taken = new Set(
      (await prisma.acoProfile.findMany({ where: { userId: account.userId }, select: { name: true } })).map((p) => p.name.toLowerCase()),
    );
    const base = `#${account.accountNumber} ${account.label}`.slice(0, 110);
    let name = base;
    for (let suffix = 2; taken.has(name.toLowerCase()); suffix += 1) name = `${base} (${suffix})`;
    const profile = await prisma.acoProfile.create({ data: { userId: account.userId, name, ...shipping }, select: { id: true } });
    await prisma.acoAccount.update({ where: { id: account.id }, data: { profileId: profile.id } });
  }

  if (!account.email || !account.imapHost) {
    if (account.imapConfigId) await prisma.acoAccount.update({ where: { id: account.id }, data: { imapConfigId: null } });
  } else {
    const config = account.imapConfig && account.imapConfig.email.toLowerCase() === account.email.toLowerCase()
      ? await prisma.acoImapConfig.findUniqueOrThrow({ where: { id: account.imapConfig.id } })
      : await prisma.acoImapConfig.findFirst({ where: { userId: account.userId, email: { equals: account.email, mode: "insensitive" } } });
    const hasOwnPassword = Boolean(account.encryptedPassword && account.encryptionIv);
    const values = {
      email: account.email,
      emailProvider: account.emailProvider,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecurity: account.imapSecurity,
      encryptedPassword: hasOwnPassword ? account.encryptedPassword : config?.encryptedPassword ?? null,
      encryptionIv: hasOwnPassword ? account.encryptionIv : config?.encryptionIv ?? null,
    };
    // Same inbox for every linked account, so classic changes propagate like a modular IMAP edit.
    const configId = config
      ? (await prisma.acoImapConfig.update({ where: { id: config.id }, data: values, select: { id: true } })).id
      : (await prisma.acoImapConfig.create({ data: { userId: account.userId, ...values }, select: { id: true } })).id;
    await prisma.$transaction([
      prisma.acoAccount.updateMany({ where: { imapConfigId: configId }, data: imapAccountData(values) }),
      prisma.acoAccount.update({ where: { id: account.id }, data: { imapConfigId: configId, ...imapAccountData(values) } }),
    ]);
  }

  if ((account.cardId === null && account.cardOnFile) || account.retailerCards.length) {
    try {
      const result = await importExistingAccountCards([account.userId]);
      const skipped = result.skipped.filter((reason) => reason.startsWith(`#${account.accountNumber} `));
      if (skipped.length) return `Card not added to library: ${skipped.join(" ")}`;
    } catch (error) {
      return `Card library sync failed: ${errorMessage(error)}`;
    }
  }
  return null;
}

function uniqueCardLabel(taken: Set<string>, base: string, expMonth: number, expYear: number): string {
  const withExpiry = `${base} (${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)})`;
  let label = [base, withExpiry].find((candidate) => !taken.has(candidate.toLowerCase()));
  for (let suffix = 2; !label; suffix += 1) {
    const candidate = `${withExpiry} #${suffix}`;
    if (!taken.has(candidate.toLowerCase())) label = candidate;
  }
  taken.add(label.toLowerCase());
  return label;
}

/**
 * Moves account cards that predate the card library (default and retailer-specific) into the library,
 * reading full numbers from the main sheet tab. Identical cards within a user are shared. Safe to re-run.
 */
export async function importExistingAccountCards(userIds?: string[], { dryRun = false } = {}) {
  const accounts = await prisma.acoAccount.findMany({
    where: {
      ...(userIds ? { userId: { in: userIds } } : {}),
      OR: [{ cardId: null, cardOnFile: { isNot: null } }, { retailerCards: { some: { cardId: null } } }],
    },
    select: {
      id: true,
      userId: true,
      accountNumber: true,
      label: true,
      botProfileName: true,
      cardId: true,
      cardOnFile: true,
      retailerCards: { where: { cardId: null } },
    },
    orderBy: [{ userId: "asc" }, { accountNumber: "asc" }],
  });
  const result = { created: 0, linked: 0, skipped: [] as string[] };
  if (accounts.length === 0) return result;

  const [sheetRows, vault] = await Promise.all([getMainSheetRows(), getAllCardVaultRows()]);
  const libraryCards = await prisma.acoCard.findMany({
    where: { userId: { in: Array.from(new Set(accounts.map((account) => account.userId))) } },
  });
  const cardKey = (userId: string, cardNumber: string, expMonth: number, expYear: number, cardholderName: string) =>
    `${userId}|${cardNumber}|${expMonth}|${expYear}|${cardholderName.trim().toLowerCase()}`;
  const cardIdByKey = new Map<string, string>();
  const labelsByUser = new Map<string, Set<string>>();
  const labelsFor = (userId: string) => {
    const labels = labelsByUser.get(userId) ?? new Set<string>();
    labelsByUser.set(userId, labels);
    return labels;
  };
  for (const card of libraryCards) {
    labelsFor(card.userId).add(card.label.toLowerCase());
    const entry = vault.get(card.id);
    if (entry) cardIdByKey.set(cardKey(card.userId, entry.cardNumber.replace(/\D/g, ""), card.expMonth, card.expYear, card.cardholderName), card.id);
  }

  const created: Array<{ cardId: string; entry: CardVaultEntry }> = [];
  const defaultLinks: Array<{ accountId: string; cardId: string }> = [];
  const retailerLinks: Array<{ retailerCardId: string; cardId: string }> = [];

  for (const account of accounts) {
    const targets = [
      ...(account.cardId === null && account.cardOnFile
        ? [{ masked: account.cardOnFile, retailer: null as string | null, retailerCardId: null as string | null }]
        : []),
      ...account.retailerCards.map((card) => ({ masked: card, retailer: card.retailer, retailerCardId: card.id })),
    ];

    for (const target of targets) {
      const where = `#${account.accountNumber} ${account.label} (${target.retailer ?? "default card"})`;
      const row = findSheetCardRow(sheetRows, account, target.masked, target.retailer);
      const cardNumber = (row?.[5] ?? "").replace(/\D/g, "");
      const cvv = (row?.[8] ?? "").trim();
      if (!row || !/^\d{12,19}$/.test(cardNumber) || cardNumber.slice(-4) !== target.masked.last4 || !/^\d{3,4}$/.test(cvv)) {
        result.skipped.push(`${where}: full card details were not found in the Google Sheet.`);
        continue;
      }

      const expMonth = target.masked.expMonth ?? Number(row[6]);
      const expYear = normalizeExpirationYear(target.masked.expYear ?? Number(row[7]));
      if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear)) {
        result.skipped.push(`${where}: card expiration is missing.`);
        continue;
      }

      const cardholderName = target.masked.cardholderName || row[3] || "";
      const key = cardKey(account.userId, cardNumber, expMonth, expYear, cardholderName);
      let cardId = cardIdByKey.get(key);
      if (!cardId) {
        const cardBrand = normalizeCardBrand(target.masked.cardBrand) ?? normalizeCardBrand(row[4]) ?? (target.masked.cardBrand || row[4] || "Card");
        const last4 = cardNumber.slice(-4);
        const data = {
          userId: account.userId,
          label: uniqueCardLabel(labelsFor(account.userId), `${cardBrand} ···· ${last4}`, expMonth, expYear),
          cardholderName,
          cardBrand,
          last4,
          expMonth,
          expYear,
        };
        cardId = dryRun ? `dry-run-${created.length}` : (await prisma.acoCard.create({ data, select: { id: true } })).id;
        cardIdByKey.set(key, cardId);
        created.push({ cardId, entry: { cardholderName, cardBrand, cardNumber, expMonth, expYear, cvv } });
      }

      if (target.retailerCardId) retailerLinks.push({ retailerCardId: target.retailerCardId, cardId });
      else defaultLinks.push({ accountId: account.id, cardId });
    }
  }

  result.created = created.length;
  result.linked = defaultLinks.length + retailerLinks.length;
  if (dryRun) return result;

  try {
    await appendCardVaultRows(created);
  } catch (error) {
    await prisma.acoCard.deleteMany({ where: { id: { in: created.map((entry) => entry.cardId) } } });
    throw error;
  }

  // Sheet rows already hold these exact cards, so linking only records the relationship.
  await prisma.$transaction([
    ...defaultLinks.map((link) => prisma.acoAccount.update({ where: { id: link.accountId }, data: { cardId: link.cardId } })),
    ...retailerLinks.map((link) => prisma.acoRetailerCard.update({ where: { id: link.retailerCardId }, data: { cardId: link.cardId } })),
  ]);

  return result;
}
