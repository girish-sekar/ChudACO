import type { NextRequest } from "next/server";

/** Optional `accountIds=a,b,c` filter shared by the admin export routes; empty means all accounts. */
export function accountIdFilter(request: NextRequest): { id: { in: string[] } } | Record<string, never> {
  const ids = Array.from(new Set(
    (request.nextUrl.searchParams.get("accountIds") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ));
  return ids.length ? { id: { in: ids } } : {};
}
