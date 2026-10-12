"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetchJson, formatDate, toCurrency, type Checkout, type CheckoutStatus } from "@/lib/dashboard";
import type { DropSummaryPricingRule } from "@/lib/drop-summary-pricing";
import { StatusPill } from "@/components/dashboard/status-pill";
import UserCheckoutSummary from "./user-summary";

type CheckoutsResponse = { data: Checkout[] };
type ProfileResponse = { data: { username: string; discordUsername?: string; avatarUrl: string | null } };
type PricingRulesResponse = { data: DropSummaryPricingRule[] };
type CheckoutView = "summary" | "details";
type DatePreset = "today" | "7d" | "30d" | "90d";

const datePresets: Array<{ key: DatePreset; label: string; days: number }> = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
];

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const tabs: Array<{ label: string; value: "all" | CheckoutStatus }> = [
  { label: "All", value: "all" },
  { label: "Success", value: "success" },
  { label: "In queue", value: "pending" },
  { label: "Failed", value: "failed" },
];

export default function CheckoutsPage() {
  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => {
    const date = new Date(now);
    date.setDate(date.getDate() - 29);
    return dateInputValue(date);
  });
  const [to, setTo] = useState(() => dateInputValue(now));
  const [activePreset, setActivePreset] = useState<DatePreset | null>("30d");
  const [view, setView] = useState<CheckoutView>("summary");
  const [status, setStatus] = useState<"all" | CheckoutStatus>("all");
  const [query, setQuery] = useState("");

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    return `/api/checkouts?${params.toString()}`;
  }, [from, to]);

  const { data, error, isLoading } = useSWR<CheckoutsResponse>(endpoint, fetchJson);
  const { data: profileData } = useSWR<ProfileResponse>("/api/profile", fetchJson);
  const { data: pricingData } = useSWR<PricingRulesResponse>("/api/pricing", fetchJson);
  const checkouts = useMemo(() => data?.data ?? [], [data]);
  const filteredCheckouts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return checkouts.filter((checkout) => {
      if (status !== "all" && checkout.status !== status) return false;
      if (!normalizedQuery) return true;
      return checkout.item.toLowerCase().includes(normalizedQuery) || checkout.retailer.toLowerCase().includes(normalizedQuery);
    });
  }, [checkouts, query, status]);

  function applyPreset(preset: (typeof datePresets)[number]) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (preset.days - 1));
    setFrom(dateInputValue(start));
    setTo(dateInputValue(end));
    setActivePreset(preset.key);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold">My checkouts</h1>
        <p className="mt-1 text-sm text-[#9C9AAE]">Your personal checkout summary and history.</p>
      </header>

      <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[#9C9AAE]">
              From
              <input
                type="date"
                value={from}
                max={to}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setActivePreset(null);
                }}
                className="mt-1 block w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-2 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-[#9C9AAE]">
              To
              <input
                type="date"
                value={to}
                min={from}
                onChange={(event) => {
                  setTo(event.target.value);
                  setActivePreset(null);
                }}
                className="mt-1 block w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-2 py-2 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {datePresets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  activePreset === preset.key
                    ? "bg-[#2F5BFF] text-[#F2F1F6]"
                    : "border border-[#2C2D3A] bg-[#101014] text-[#9C9AAE] hover:text-[#F2F1F6]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <nav className="flex gap-1 border-b border-[#2C2D3A]" role="tablist" aria-label="Checkout views">
        {([
          { key: "summary", label: "Summary" },
          { key: "details", label: "Details" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={view === tab.key}
            onClick={() => setView(tab.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              view === tab.key
                ? "border-[#F04438] text-[#F7F4EF]"
                : "border-transparent text-[#9C9AAE] hover:text-[#F2F1F6]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {view === "summary" ? (
        <>
          {isLoading ? <p className="text-sm text-[#9C9AAE]">Loading your checkout summary...</p> : null}
          {error ? <p className="text-sm text-[#FF5D5D]">Failed to load your checkouts.</p> : null}
          {data ? (
            <UserCheckoutSummary
              checkouts={checkouts}
              username={profileData?.data.discordUsername ?? profileData?.data.username ?? "Your Discord account"}
              avatarUrl={profileData?.data.avatarUrl ?? null}
              pricingRules={pricingData?.data ?? []}
            />
          ) : null}
        </>
      ) : (
        <>
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
            {filteredCheckouts.map((item) => (
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
                  <p className="mt-1 text-sm text-[#9C9AAE]">
                    Order #: {item.orderNumber ? item.orderNumber : "not captured"}
                  </p>
                  <p className="mt-2 font-mono text-xs text-[#605E72]">{item.ticketCode}</p>
                </div>
              </article>
            ))}
            {data && filteredCheckouts.length === 0 ? <p className="text-sm text-[#605E72]">No matching checkouts.</p> : null}
          </section>
        </>
      )}
    </div>
  );
}