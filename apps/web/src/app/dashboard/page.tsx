"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetchJson, formatDate, toCurrency, type BillingEntry, type Checkout } from "@/lib/dashboard";
import { StatusPill } from "@/components/dashboard/status-pill";

type CheckoutsResponse = { data: Checkout[] };
type BillingResponse = {
  data: BillingEntry[];
  summary: {
    totalOwed: string;
    paidThisMonth: string;
    overdueCount: number;
  };
};

function dayKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export default function DashboardPage() {
  const { data: checkoutData, error: checkoutError } = useSWR<CheckoutsResponse>(
    "/api/checkouts",
    fetchJson,
  );
  const { data: billingData, error: billingError } = useSWR<BillingResponse>(
    "/api/billing",
    fetchJson,
  );

  if (checkoutError || billingError) {
    return <p className="text-sm text-[#FF5D5D]">Failed to load dashboard data.</p>;
  }

  if (!checkoutData || !billingData) {
    return <p className="text-sm text-[#9C9AAE]">Loading overview...</p>;
  }

  const checkouts = checkoutData.data;
  const activeTasks = checkouts.filter((item) => item.status === "pending").length;
  const finishedCount = checkouts.filter((item) => item.status !== "pending").length;
  const successCount = checkouts.filter((item) => item.status === "success").length;
  const successRate = finishedCount === 0 ? 0 : Math.round((successCount / finishedCount) * 100);

  const today = new Date();
  const todayCount = checkouts.filter((item) => dayKey(item.occurredAt) === dayKey(today.toISOString())).length;

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const spendThisMonth = checkouts
    .filter((item) => new Date(item.occurredAt) >= monthStart)
    .reduce((sum, item) => sum + Number(item.price), 0);

  const dayBuckets = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return {
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      key: dayKey(date.toISOString()),
      count: 0,
    };
  });

  for (const item of checkouts) {
    const key = dayKey(item.occurredAt);
    const bucket = dayBuckets.find((entry) => entry.key === key);
    if (bucket) {
      bucket.count += 1;
    }
  }

  const maxBar = Math.max(...dayBuckets.map((item) => item.count), 1);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-[#9C9AAE]">Live PAS activity for your account.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active tasks", value: String(activeTasks) },
          { label: "Success rate", value: `${successRate}%` },
          { label: "Checkouts today", value: String(todayCount) },
          { label: "Spend this month", value: toCurrency(spendThisMonth) },
        ].map((stat) => (
          <article key={stat.label} className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">{stat.label}</p>
            <p className="mt-2 font-heading text-3xl font-bold text-[#F2F1F6]">{stat.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
        <p className="font-heading text-xl font-semibold">Last 7 days</p>
        <div className="mt-4 grid grid-cols-7 gap-3">
          {dayBuckets.map((bucket) => (
            <div key={bucket.key} className="space-y-2 text-center">
              <div className="flex h-28 items-end rounded-md border border-[#2C2D3A] bg-[#101014] p-2">
                <div
                  className="w-full rounded-sm bg-[#2F5BFF]"
                  style={{ height: `${Math.max((bucket.count / maxBar) * 100, 6)}%` }}
                />
              </div>
              <p className="text-xs text-[#9C9AAE]">{bucket.label}</p>
              <p className="font-mono text-xs text-[#F2F1F6]">{bucket.count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
        <div className="flex items-center justify-between">
          <p className="font-heading text-xl font-semibold">Recent checkouts</p>
          <Link href="/dashboard/checkouts" className="text-sm text-[#2F5BFF] hover:underline">
            View all
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {checkouts.slice(0, 3).map((item) => (
            <article key={item.id} className="rounded-lg border border-[#2C2D3A] bg-[#101014] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-heading text-lg font-semibold">{item.item}</p>
                <StatusPill status={item.status} />
              </div>
              <p className="mt-1 text-sm text-[#9C9AAE]">
                {item.retailer} • {formatDate(item.occurredAt)}
              </p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <p className="text-[#9C9AAE]">
                  {item.qtyLabel} • {toCurrency(item.price)}
                </p>
                <p className="font-mono text-xs text-[#605E72]">{item.ticketCode}</p>
              </div>
            </article>
          ))}
          {checkouts.length === 0 ? <p className="text-sm text-[#605E72]">No checkouts yet.</p> : null}
        </div>
      </section>
    </div>
  );
}