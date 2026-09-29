import { prisma } from "@chudaco/db";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { hasImapCredentials, testImapCredentials } from "@/lib/imap-test";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function POST(_request: Request, context: RouteParams) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.acoImapConfig.findFirst({
    where: { id: context.params.id, userId: authContext.userId },
    select: { email: true, imapHost: true, imapPort: true, imapSecurity: true, encryptedPassword: true, encryptionIv: true },
  });
  if (!config) {
    return NextResponse.json({ success: false, error: "IMAP inbox not found" }, { status: 404 });
  }
  if (!hasImapCredentials(config)) {
    return NextResponse.json({ success: false, error: "Save an IMAP password before testing." }, { status: 409 });
  }

  return NextResponse.json(await testImapCredentials(config));
}
