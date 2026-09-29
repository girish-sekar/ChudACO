import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/api-auth";
import { importExistingAccountCards } from "@/lib/aco-library";

export async function POST() {
  const authContext = await getAuthenticatedContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ data: await importExistingAccountCards([authContext.userId]) });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not import existing cards", detail: error instanceof Error ? error.message : undefined },
      { status: 502 },
    );
  }
}
