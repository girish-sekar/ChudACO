import { prisma } from "@chudaco/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";

const querySchema = z.object({
  retailer: z.string().trim().min(1).optional(),
  retailers: z.string().trim().min(1).optional(),
});

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

function splitName(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) {
    return { firstName: trimmed, lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function splitAddress(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { address: "", address2: "" };
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    address: lines[0] ?? "",
    address2: lines.slice(1).join(" "),
  };
}

function formatPhone(value: string | null | undefined) {
  return (value ?? "").trim();
}

function formatExpYear(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";

  const year = normalized.replace(/[^0-9]/g, "");
  if (!year) return "";

  if (year.length === 2) {
    return `20${year}`;
  }

  return year.length >= 4 ? year.slice(0, 4) : year;
}

function formatExpMonth(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";

  const month = normalized.replace(/[^0-9]/g, "");
  if (!month) return "";

  const numeric = Number(month);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 12) {
    return month.padStart(2, "0");
  }

  return String(numeric).padStart(2, "0");
}

function normalizeCardType(value: string | null | undefined) {
  const type = (value ?? "").trim().toLowerCase();
  if (!type) return "";
  if (type.includes("amex")) return "amex";
  if (type.includes("visa")) return "visa";
  if (type.includes("mastercard") || type.includes("mc")) return "mastercard";
  if (type.includes("discover")) return "discover";
  return type;
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

  const userFilters = parseRetailerFilters(parsed.data.retailer, parsed.data.retailers);
  if (userFilters.length === 0) {
    return NextResponse.json(
      { error: "Valor export requires at least one retailer selection." },
      { status: 400 },
    );
  }

  const effectiveRetailerFilters = userFilters;

  if (effectiveRetailerFilters.length === 0) {
    return new NextResponse("{}", {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=valor-accounts.json",
      },
    });
  }

  const accounts = await prisma.acoAccount.findMany({
    where: {
      OR: [
        ...effectiveRetailerFilters.map((retailer) => ({
          retailer: { equals: retailer, mode: "insensitive" as const },
        })),
        ...effectiveRetailerFilters.map((retailer) => ({
          retailerLogins: {
            some: {
              retailer: { equals: retailer, mode: "insensitive" as const },
            },
          },
        })),
      ],
    },
    orderBy: [{ retailer: "asc" }, { label: "asc" }],
    include: {
      cardOnFile: true,
      retailerCards: true,
      retailerLogins: true,
    },
  });

  const payload = Object.fromEntries(
    accounts
      .filter((account) => {
        const logins = account.retailerLogins.length > 0 ? account.retailerLogins : [{ retailer: account.retailer }];
        return logins.some((login) =>
          effectiveRetailerFilters.some((retailer) => retailer.toLowerCase() === login.retailer.toLowerCase()),
        );
      })
      .map((account) => {
        const selectedRetailer =
          effectiveRetailerFilters.find((retailer) =>
            [account.retailer, ...(account.retailerLogins ?? []).map((login) => login.retailer)].some(
              (value) => value.toLowerCase() === retailer.toLowerCase(),
            ),
          ) ?? effectiveRetailerFilters[0];
        const selectedCard =
          account.retailerCards.find((card) => card.retailer.toLowerCase() === selectedRetailer.toLowerCase()) ??
          account.cardOnFile;

        const shippingName = splitName(account.shippingName ?? account.billingName ?? account.botProfileName ?? "");
        const billingName = splitName(
          account.billingSameAsShipping ? account.shippingName ?? account.billingName : account.billingName ?? account.shippingName ?? "",
        );
        const shippingAddress = splitAddress(account.shippingAddr);
        const billingAddress = splitAddress(
          account.billingSameAsShipping ? account.shippingAddr ?? account.billingAddr : account.billingAddr,
        );

        const cardNumber = selectedCard?.last4 ? `•••• ${selectedCard.last4}` : "";
        const cardType = normalizeCardType(selectedCard?.cardBrand ?? "");
        const cardMonth = formatExpMonth(selectedCard?.expMonth ?? "");
        const cardYear = formatExpYear(selectedCard?.expYear ?? "");
        const cardholderName = selectedCard?.cardholderName ?? "";

        const item = {
          name: account.botProfileName,
          email: account.email,
          phoneNumber: formatPhone(account.shippingPhone ?? account.billingPhone),
          billingSameAsShipping: account.billingSameAsShipping,
          oneCheckout: account.onlyOneCheckout,
          quickTask: false,
          card: {
            holder: cardholderName || `${shippingName.firstName} ${shippingName.lastName}`.trim(),
            number: cardNumber,
            expiration: cardMonth && cardYear ? `${cardMonth}/${cardYear.slice(-2)}` : "",
            cvv: "",
            type: cardType,
          },
          shipping: {
            firstName: shippingName.firstName,
            lastName: shippingName.lastName,
            addressLine1: shippingAddress.address,
            addressLine2: shippingAddress.address2,
            city: account.shippingCity ?? "",
            countryName: "United States",
            countryCode: "US",
            state: account.shippingState ?? "",
            zipCode: account.shippingZip ?? "",
          },
          billing: {
            firstName: billingName.firstName,
            lastName: billingName.lastName,
            addressLine1: billingAddress.address,
            addressLine2: billingAddress.address2,
            city: account.billingCity ?? account.shippingCity ?? "",
            countryName: "United States",
            countryCode: "US",
            state: account.billingState ?? account.shippingState ?? "",
            zipCode: account.billingZip ?? account.shippingZip ?? "",
          },
          id: account.id,
          totalSpent: 0,
        };

        return [account.id, item];
      }),
  );

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=valor-accounts.json",
    },
  });
}
