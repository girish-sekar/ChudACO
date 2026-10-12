import { decrypt, getImapEncryptionKeyFromEnv, prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";
import { accountIdFilter } from "@/lib/admin-export";

const querySchema = z.object({
  mode: z.enum(["accounts", "imap"]).default("accounts"),
  retailers: z.string().trim().min(1).optional(),
});

function decryptPassword(value: string | null, iv: string | null): string | null {
  if (!value || !iv) return null;
  const [ciphertext, authTag] = value.split(":");
  if (!ciphertext || !authTag) return null;
  return decrypt(ciphertext, iv, authTag, getImapEncryptionKeyFromEnv());
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET(request: NextRequest) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getAdminDiscordIds().has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse({
    mode: request.nextUrl.searchParams.get("mode") ?? undefined,
    retailers: request.nextUrl.searchParams.get("retailers") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }
  const retailers = Array.from(new Set(
    (parsed.data.retailers ?? "Target").split(",").map((value) => value.trim()).filter(Boolean),
  ));
  if (retailers.length === 0) {
    return NextResponse.json({ error: "Select at least one retailer." }, { status: 400 });
  }

  const accounts = await prisma.acoAccount.findMany({
    where: {
      ...accountIdFilter(request),
      OR: retailers.flatMap((retailer) => [
        { retailer: { equals: retailer, mode: "insensitive" as const } },
        { retailerLogins: { some: { retailer: { equals: retailer, mode: "insensitive" as const }, enabled: true } } },
      ]),
    },
    orderBy: [{ retailer: "asc" }, { label: "asc" }],
    select: {
      retailer: true,
      loginEmail: true,
      encryptedLoginPassword: true,
      loginPasswordIv: true,
      email: true,
      imapHost: true,
      imapPort: true,
      encryptedPassword: true,
      encryptionIv: true,
      retailerLogins: { select: {
        retailer: true,
        loginEmail: true,
        encryptedLoginPassword: true,
        loginPasswordIv: true,
        enabled: true,
      } },
    },
  });

  const lines = new Set<string>();
  try {
    for (const account of accounts) {
      const entries = (account.retailerLogins.length > 0
        ? account.retailerLogins
        : [{ ...account, enabled: true }])
        .filter((entry) => entry.enabled && retailers.some(
          (retailer) => retailer.toLowerCase() === entry.retailer.toLowerCase(),
        ));
      if (entries.length === 0) continue;

      if (parsed.data.mode === "imap") {
        if (!account.imapHost || !account.email) continue;
        const password = decryptPassword(account.encryptedPassword, account.encryptionIv);
        if (!password) continue;
        lines.add([account.imapHost, String(account.imapPort), account.email, password].map(csvField).join(","));
      } else {
        for (const entry of entries) {
          if (!entry.loginEmail) continue;
          const password = decryptPassword(entry.encryptedLoginPassword, entry.loginPasswordIv);
          if (!password) continue;
          if (/[:\r\n]/.test(entry.loginEmail) || /[\r\n]/.test(password)) {
            return NextResponse.json({ error: "A retailer credential cannot be represented in username:password format." }, { status: 400 });
          }
          lines.add(`${entry.loginEmail}:${password}`);
        }
      }
    }
  } catch {
    return NextResponse.json({ error: "Unable to decrypt Shikari credentials. Check the encryption configuration." }, { status: 500 });
  }

  const isImap = parsed.data.mode === "imap";
  const rows = isImap ? ["imap_server,port,username,password", ...lines] : Array.from(lines);
  return new NextResponse(rows.join("\r\n"), {
    headers: {
      "Content-Type": isImap ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="shikari-${isImap ? "imap.csv" : "accounts.txt"}"`,
      "Cache-Control": "no-store",
    },
  });
}