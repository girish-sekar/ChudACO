"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetchJson, formatDate, toCurrency, type Checkout, type CheckoutStatus } from "@/lib/dashboard";
import { StatusPill } from "@/components/dashboard/status-pill";

type CheckoutsResponse = { data: Checkout[] };

const tabs: Array<{ label: string; value: "all" | CheckoutStatus }> = [
  { label: "All", value: "all" },
  { label: "Success", value: "success" },
  { label: "In queue", value: "pending" },
  { label: "Failed", value: "failed" },
];

export default function CheckoutsPage() {
  const [status, setStatus] = useState<"all" | CheckoutStatus>("all");
  const [query, setQuery] = useState("");

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "all") {
      params.set("status", status);
    }

    if (query.trim().length > 0) {
      params.set("q", query.trim());
    }

    const qs = params.toString();
    return qs ? `/api/checkouts?${qs}` : "/api/checkouts";
  }, [query, status]);

  const { data, error, isLoading } = useSWR<CheckoutsResponse>(endpoint, fetchJson);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold">Checkouts</h1>
        <p className="mt-1 text-sm text-[#9C9AAE]">Track every ticket and fulfillment status.</p>
      </header>

      <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search item or retailer"
            className="w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6] outline-none placeholder:text-[#605E72] md:max-w-sm"
          />
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatus(tab.value)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  status === tab.value
                    ? "bg-[#2F5BFF] text-[#F2F1F6]"
                    : "border border-[#2C2D3A] bg-[#101014] text-[#9C9AAE] hover:text-[#F2F1F6]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {isLoading ? <p className="text-sm text-[#9C9AAE]">Loading checkouts...</p> : null}
        {error ? <p className="text-sm text-[#FF5D5D]">Failed to load checkouts.</p> : null}
        {data?.data.map((item) => (
          <article key={item.id} className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs text-[#605E72]">
                  {item.retailer} • {formatDate(item.occurredAt)}
                </p>
                <p className="mt-1 font-heading text-2xl font-bold">{item.item}</p>
                <p className="mt-2 text-sm text-[#9C9AAE]">
                  {item.qtyLabel} • {toCurrency(item.price)}
                </p>
              </div>
              <StatusPill status={item.status} />
            </div>
            <div className="mt-4 border-t border-[#2C2D3A] pt-3">
              <p className="text-sm text-[#9C9AAE]">
                Tracking: {item.trackingNumber ? item.trackingNumber : "no tracking yet"}
              </p>
              <p className="mt-2 font-mono text-xs text-[#605E72]">{item.ticketCode}</p>
            </div>
          </article>
        ))}
        {data && data.data.length === 0 ? <p className="text-sm text-[#605E72]">No matching checkouts.</p> : null}
      </section>
    </div>
  );
}