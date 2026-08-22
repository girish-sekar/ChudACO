import { decrypt, getImapEncryptionKeyFromEnv, prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";

const querySchema = z.object({
  retailer: z.string().trim().min(1).optional(),
  retailers: z.string().trim().min(1).optional(),
});

function parseEncryptedValue(value: string | null, iv: string | null): string | null {
  if (!value || !iv) {
    return null;
  }

  const [ciphertext, authTag] = value.split(":");
  if (!ciphertext || !authTag) {
    return null;
  }

  try {
    const key = getImapEncryptionKeyFromEnv();
    return decrypt(ciphertext, iv, authTag, key);
  } catch {
    return null;
  }
}

function normalizeProvider(emailProvider: string | null, imapHost: string, email: string): string {
  if (emailProvider && emailProvider.trim()) {
    return emailProvider.trim().toLowerCase();
  }

  const host = imapHost.toLowerCase();
  if (host.includes("gmail")) return "gmail";
  if (host.includes("icloud") || host.includes("me.com")) return "icloud";
  if (host.includes("yahoo")) return "yahoo";
  if (host.includes("outlook") || host.includes("office365") || host.includes("hotmail")) return "outlook";
  if (host.includes("aol")) return "aol";
  if (host.includes("proton")) return "proton";

  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain.includes("gmail")) return "gmail";
  if (domain.includes("icloud") || domain.includes("me.com")) return "icloud";
  if (domain.includes("yahoo")) return "yahoo";
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) return "outlook";

  return "other";
}

function parseRetailerFilters(single?: string, multiple?: string): string[] {
  const fromSingle = single ? [single.trim()] : [];
  const fromMultiple = multiple
    ? multiple
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];

  return [...new Set([...fromSingle, ...fromMultiple])];
}

export async function GET(request: NextRequest) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admins = getAdminDiscordIds();
  if (!admins.has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse({
    retailer: request.nextUrl.searchParams.get("retailer") ?? undefined,
    retailers: request.nextUrl.searchParams.get("retailers") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const retailerFilters = parseRetailerFilters(parsed.data.retailer, parsed.data.retailers);

  const where =
    retailerFilters.length === 0
      ? undefined
      : {
          OR: [
            ...retailerFilters.map((retailer) => ({
              retailer: { equals: retailer, mode: "insensitive" as const },
            })),
            ...retailerFilters.map((retailer) => ({
              retailerLogins: {
                some: {
                  retailer: { equals: retailer, mode: "insensitive" as const },
                },
              },
            })),
          ],
        };

  const accounts = await prisma.acoAccount.findMany({
    where,
    orderBy: [{ retailer: "asc" }, { label: "asc" }],
    select: {
      retailer: true,
      loginEmail: true,
      email: true,
      emailProvider: true,
      imapHost: true,
      encryptedPassword: true,
      encryptionIv: true,
      encryptedLoginPassword: true,
      loginPasswordIv: true,
      retailerLogins: {
        select: {
          retailer: true,
          loginEmail: true,
          encryptedLoginPassword: true,
          loginPasswordIv: true,
        },
      },
    },
  });

  const lines = accounts
    .flatMap((account) => {
      const imapPassword = parseEncryptedValue(account.encryptedPassword, account.encryptionIv);
      if (!imapPassword || !account.email) {
        return [];
      }

      const provider = normalizeProvider(account.emailProvider, account.imapHost, account.email);

      const entries =
        account.retailerLogins.length > 0
          ? account.retailerLogins
          : [
              {
                retailer: account.retailer,
                loginEmail: account.loginEmail ?? "",
                encryptedLoginPassword: account.encryptedLoginPassword ?? "",
                loginPasswordIv: account.loginPasswordIv ?? "",
              },
            ];

      return entries
        .filter((entry) => {
          if (retailerFilters.length === 0) {
            return true;
          }

          return retailerFilters.some(
            (retailer) => retailer.toLowerCase() === entry.retailer.toLowerCase(),
          );
        })
        .map((entry) => {
          const retailLoginPassword = parseEncryptedValue(
            entry.encryptedLoginPassword,
            entry.loginPasswordIv,
          );
          if (!entry.loginEmail) {
            return null;
          }

          return `${entry.loginEmail}:::${retailLoginPassword ?? ""}:::${account.email}:::${imapPassword}:::${provider}`;
        })
        .filter((line): line is string => line !== null);
    })
    .filter((line): line is string => line.length > 0);

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=admin-account-export.txt",
    },
  });
}