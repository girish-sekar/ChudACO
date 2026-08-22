export type CheckoutStatus = "success" | "failed" | "pending";

export type Checkout = {
  id: string;
  userId: string;
  retailer: string;
  item: string;
  qtyLabel: string;
  price: string;
  status: CheckoutStatus;
  trackingNumber: string | null;
  ticketCode: string;
  occurredAt: string;
};

export type BillingStatus = "due" | "paid" | "overdue";

export type BillingEntry = {
  id: string;
  userId: string;
  checkoutId: string | null;
  feeAmount: string;
  status: BillingStatus;
  paidMarkedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  checkout: Checkout | null;
};

export type PricingRule = {
  id: string;
  category: string;
  priceRangeLabel: string;
  feeType: "flat" | "percent";
  feeFlat: string | null;
  feePercent: string | null;
  sortOrder: number;
};

export type PaymentMethod = {
  id: string;
  key: string;
  label: string;
  handle: string;
  note: string;
};

export type AcoAccount = {
  id: string;
  userId: string;
  label: string;
  retailer: string;
  email: string;
  emailProvider: string | null;
  onlyOneCheckout: boolean;
  loginEmail: string | null;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddr: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  billingSameAsShipping: boolean;
  billingName: string | null;
  billingPhone: string | null;
  billingAddr: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  status: "active" | "locked" | "banned";
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  lastSyncAt: string | null;
  retailerLogins: {
    id: string;
    retailer: string;
    loginEmail: string;
  }[];
};

export type CardOnFile = {
  id: string;
  acoAccountId: string;
  cardBrand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  cardholderName: string | null;
  updatedAt: string;
};

export type AdminCheckoutRow = {
  id: string;
  userId: string;
  acoAccountId: string | null;
  retailer: string;
  item: string;
  qtyLabel: string;
  price: string;
  status: CheckoutStatus;
  trackingNumber: string | null;
  ticketCode: string;
  occurredAt: string;
  user: {
    id: string;
    username: string;
    discordId: string;
  };
  acoAccount: {
    id: string;
    label: string;
  } | null;
};

export type AdminCheckoutSummary = {
  totalCheckouts: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  totalDollarVolume: string;
};

export type AdminBillingPendingEntry = {
  id: string;
  userId: string;
  checkoutId: string | null;
  feeAmount: string;
  status: BillingStatus;
  paidMarkedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    discordId: string;
  };
  checkout: {
    id: string;
    item: string;
    retailer: string;
  } | null;
};

export type Profile = {
  id: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notifyWeeklySummary: boolean;
  createdAt: string;
};

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function toCurrency(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString();
}

export function statusLabel(status: CheckoutStatus): string {
  if (status === "pending") {
    return "In queue";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}