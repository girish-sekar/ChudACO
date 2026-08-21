import { decrypt, getImapEncryptionKeyFromEnv, prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getAuthenticatedContext } from "@/lib/api-auth";

type RouteParams = {
  params: {
    id: string;
  };
};

function normalizeSecureMode(security: string): boolean {
  const normalized = security.trim().toLowerCase();
  return normalized === "ssl/tls" || normalized === "ssl" || normalized === "tls";
}

function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Connection failed";
  }

  const message = error.message.trim();
  if (!message) {
    return "Connection failed";
  }

  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

export async function POST(_request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.acoAccount.findFirst({
    where: {
      id: context.params.id,
      userId: authContext.userId,
    },
    select: {
      id: true,
      label: true,
      email: true,
      imapHost: true,
      imapPort: true,
      imapSecurity: true,
      encryptedPassword: true,
      encryptionIv: true,
    },
  });

  if (!account) {
    return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
  }

  try {
    const [ciphertext, authTag] = account.encryptedPassword.split(":");
    if (!ciphertext || !authTag) {
      throw new Error("Invalid stored credential payload");
    }

    const key = getImapEncryptionKeyFromEnv();
    const password = decrypt(ciphertext, account.encryptionIv, authTag, key);

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: normalizeSecureMode(account.imapSecurity),
      auth: {
        user: account.email,
        pass: password,
      },
      logger: false,
    });

    await client.connect();
    await client.logout();

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 200 },
    );
  }
}