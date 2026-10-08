"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  fetchJson,
  formatDate,
  toCurrency,
  type DropSummaryResponse,
} from "@/lib/dashboard";
import ExecutiveSummary from "./executive-summary";

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type PresetKey = "today" | "7d" | "30d" | "90d";
type TabKey = "overview" | "executive-summary";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "executive-summary", label: "Executive Summary" },
];

const presets: Array<{ key: PresetKey; label: string; days: number }> = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
];

function formatDayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DropSummaryDashboard() {
  const now = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const date = new Date(now);
    date.setDate(date.getDate() - 30);
    return toDateInputValue(date);
  }, [now]);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(toDateInputValue(now));
  const [activePreset, setActivePreset] = useState<PresetKey | null>("30d");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  function applyPreset(preset: (typeof presets)[number]) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - preset.days);
    setFrom(toDateInputValue(start));
    setTo(toDateInputValue(end));
    setActivePreset(preset.key);
  }

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    params.set("from", new Date(`${from}T00:00:00.000`).toISOString());
    params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    return `/api/admin/drop-summary?${params.toString()}`;
  }, [from, to]);

  const { data, error, isLoading } = useSWR<DropSummaryResponse>(endpoint, fetchJson);

  const maxDayCount = useMemo(
    () => Math.max(1, ...(data?.byDay.map((day) => day.count) ?? [1])),
    [data],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold">Drop Summary</h1>
        <p className="mt-1 text-sm text-[#9C9AAE]">
          Successful checkouts recorded from the #success Discord channel, for a selected time range.
        </p>
      </header>

      <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
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
            {presets.map((preset) => (
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

      <div className="flex gap-2 border-b border-[#2C2D3A]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-[#2F5BFF] text-[#F2F1F6]"
                : "border-transparent text-[#9C9AAE] hover:text-[#F2F1F6]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-[#9C9AAE]">Loading drop summary...</p> : null}
      {error ? <p className="text-sm text-[#FF5D5D]">Failed to load drop summary.</p> : null}

      {data && activeTab === "executive-summary" ? <ExecutiveSummary data={data} /> : null}

      {data && activeTab === "overview" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
              <p className="text-xs text-[#605E72]">Successful checkouts</p>
              <p className="mt-2 font-heading text-3xl font-bold text-[#4ADE80]">
                {data.totals.successfulCheckouts}
              </p>
            </article>
            <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
              <p className="text-xs text-[#605E72]">
                {data.reconciliation.configured && data.reconciliation.unpricedGapCount > 0
                  ? "Known-price volume"
                  : "Total volume"}
              </p>
              <p className="mt-2 font-heading text-3xl font-bold">
                {toCurrency(data.totals.totalDollarVolume)}
              </p>
            </article>
            <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
              <p className="text-xs text-[#605E72]">
                {data.reconciliation.configured && data.reconciliation.unpricedGapCount > 0
                  ? "Avg. priced order value"
                  : "Avg. order value"}
              </p>
              <p className="mt-2 font-heading text-3xl font-bold">
                {toCurrency(data.totals.averageOrderValue)}
              </p>
            </article>
            <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
              <p className="text-xs text-[#605E72]">Unique buyers</p>
              <p className="mt-2 font-heading text-3xl font-bold">{data.totals.uniqueBuyers}</p>
            </article>
            <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
              <p className="text-xs text-[#605E72]">Retailers hit</p>
              <p className="mt-2 font-heading text-3xl font-bold">{data.totals.uniqueRetailers}</p>
            </article>
          </section>

          <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <h2 className="font-heading text-xl font-semibold">Top items</h2>
            {data.byItem.length === 0 ? (
              <p className="mt-3 text-sm text-[#605E72]">No data for this range.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="text-xs text-[#605E72]">
                      <th className="pb-2 font-normal">Item</th>
                      <th className="pb-2 font-normal">Items</th>
                      <th className="pb-2 font-normal">Price per item</th>
                      <th className="pb-2 font-normal">
                        {data.reconciliation.configured && data.reconciliation.unpricedGapCount > 0
                          ? "Known-price volume"
                          : "Volume"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byItem.map((row) => (
                      <tr key={row.item} className="border-t border-[#2C2D3A]">
                        <td className="py-2 pr-4 text-[#F2F1F6]">{row.item}</td>
                        <td className="py-2 pr-4 text-[#9C9AAE]">{row.count}</td>
                        <td className="py-2 pr-4 text-[#9C9AAE]">
                          {row.pricedCount > 0
                            ? toCurrency(Number(row.volume) / row.pricedCount)
                            : "Unknown"}
                        </td>
                        <td className="py-2 text-[#9C9AAE]">{toCurrency(row.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <h2 className="font-heading text-xl font-semibold">Top buyers</h2>
            {data.topBuyers.length === 0 ? (
              <p className="mt-3 text-sm text-[#605E72]">No data for this range.</p>
            ) : (
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.topBuyers.map((buyer, index) => (
                  <li
                    key={buyer.userId}
                    className="flex items-center justify-between rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
                  >
                    <span className="text-[#9C9AAE]">
                      <span className="mr-2 text-[#605E72]">#{index + 1}</span>
                      {buyer.username}
                      {buyer.userId.startsWith("discord:") ? (
                        <span className="ml-2 rounded-full border border-[#FFCB3C] px-2 py-0.5 text-[10px] text-[#FFCB3C]">
                          Unmapped
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[#F2F1F6]">
                      {buyer.count} • {toCurrency(buyer.volume)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <h2 className="font-heading text-xl font-semibold">Daily activity</h2>
            {data.byDay.length === 0 ? (
              <p className="mt-3 text-sm text-[#605E72]">No successful checkouts in this range.</p>
            ) : (
              <div className="mt-4 flex items-end gap-2 overflow-x-auto pb-2">
                {data.byDay.map((day) => (
                  <div key={day.date} className="flex min-w-[36px] flex-col items-center gap-2">
                    <div className="flex h-32 w-full items-end">
                      <div
                        title={`${day.count} checkouts • ${toCurrency(day.volume)}`}
                        className="w-full rounded-t-sm bg-[#2F5BFF]"
                        style={{ height: `${Math.max(6, (day.count / maxDayCount) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-[#605E72]">{formatDayLabel(day.date)}</p>
                    <p className="text-xs font-semibold text-[#F2F1F6]">{day.count}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <h2 className="font-heading text-xl font-semibold">Discord reconciliation</h2>
            <p className="mt-1 text-sm text-[#9C9AAE]">
              Cross-checks the #success channel against recorded checkouts to surface successes that never made it
              into the database.
            </p>
            {!data.reconciliation.configured ? (
              <p className="mt-3 text-sm text-[#605E72]">
                Not configured: set DISCORD_SUCCESS_CHANNEL_ID (and DISCORD_BOT_TOKEN/DISCORD_GUILD_ID) to enable
                this.
              </p>
            ) : data.reconciliation.error ? (
              <p className="mt-3 text-sm text-[#FF5D5D]">
                Failed to read the Discord channel ({data.reconciliation.error}).
              </p>
            ) : (
              <>
                {data.reconciliation.likelyMissingMessageContentIntent ? (
                  <p className="mt-3 rounded-md border border-[#FFCB3C] bg-[#2A2410] px-3 py-2 text-sm text-[#FFCB3C]">
                    Scanned {data.reconciliation.discordMessagesScanned} message(s) but none had readable content.
                    Enable &quot;Message Content Intent&quot; for the bot in the Discord Developer Portal (Bot tab →
                    Privileged Gateway Intents), since Discord strips embeds from messages the bot doesn&apos;t own
                    without it.
                  </p>
                ) : null}
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <article className="rounded-xl border border-[#2C2D3A] bg-[#101014] p-4">
                    <p className="text-xs text-[#605E72]">Discord successes found</p>
                    <p className="mt-2 font-heading text-2xl font-bold">
                      {data.reconciliation.successMessagesFound}
                    </p>
                  </article>
                  <article className="rounded-xl border border-[#2C2D3A] bg-[#101014] p-4">
                    <p className="text-xs text-[#605E72]">Already recorded</p>
                    <p className="mt-2 font-heading text-2xl font-bold text-[#4ADE80]">
                      {data.reconciliation.matchedInDatabase}
                    </p>
                  </article>
                  <article className="rounded-xl border border-[#2C2D3A] bg-[#101014] p-4">
                    <p className="text-xs text-[#605E72]">Missing from database</p>
                    <p className="mt-2 font-heading text-2xl font-bold text-[#FFCB3C]">
                      {data.reconciliation.gapCount}
                    </p>
                  </article>
                  <article className="rounded-xl border border-[#2C2D3A] bg-[#101014] p-4">
                    <p className="text-xs text-[#605E72]">Known-price recoverable volume</p>
                    <p className="mt-2 font-heading text-2xl font-bold">
                      {toCurrency(data.reconciliation.gapVolume)}
                    </p>
                  </article>
                </div>
                {data.reconciliation.unpricedGapCount > 0 ? (
                  <p className="mt-3 text-sm text-[#FFCB3C]">
                    {data.reconciliation.unpricedGapCount} Discord success(es) had no price; they are included in
                    checkout and item counts, but excluded from dollar totals.
                  </p>
                ) : null}

                {data.reconciliation.gaps.length === 0 ? (
                  <p className="mt-4 text-sm text-[#605E72]">
                    No gaps found — every Discord success in this range is already recorded.
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr className="text-xs text-[#605E72]">
                          <th className="pb-2 font-normal">Occurred</th>
                          <th className="pb-2 font-normal">Buyer</th>
                          <th className="pb-2 font-normal">Profile</th>
                          <th className="pb-2 font-normal">Item</th>
                          <th className="pb-2 font-normal">Qty</th>
                          <th className="pb-2 font-normal">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.reconciliation.gaps.map((gap) => (
                          <tr key={gap.messageId} className="border-t border-[#2C2D3A]">
                            <td className="py-2 pr-4 text-[#9C9AAE]">{formatDate(gap.occurredAt)}</td>
                            <td className="py-2 pr-4">
                              <span className="text-[#F2F1F6]">{gap.username}</span>
                              {!gap.resolved ? (
                                <span className="ml-2 rounded-full border border-[#FFCB3C] px-2 py-0.5 text-xs text-[#FFCB3C]">
                                  Unmapped
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-4 font-mono text-xs text-[#605E72]">{gap.profile}</td>
                            <td className="py-2 pr-4 text-[#F2F1F6]">{gap.item}</td>
                            <td className="py-2 pr-4 text-[#9C9AAE]">{gap.quantity}</td>
                            <td className="py-2 text-[#9C9AAE]">
                              {gap.price === "unknown" ? "Unknown" : toCurrency(gap.price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <h2 className="font-heading text-xl font-semibold">Recent successful checkouts</h2>
            {data.recent.length === 0 ? (
              <p className="mt-3 text-sm text-[#605E72]">No successful checkouts in this range.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="text-xs text-[#605E72]">
                      <th className="pb-2 font-normal">Occurred</th>
                      <th className="pb-2 font-normal">Buyer</th>
                      <th className="pb-2 font-normal">Retailer</th>
                      <th className="pb-2 font-normal">Item</th>
                      <th className="pb-2 font-normal">Qty</th>
                      <th className="pb-2 font-normal">Price</th>
                      <th className="pb-2 font-normal">Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((checkout) => (
                      <tr key={checkout.id} className="border-t border-[#2C2D3A]">
                        <td className="py-2 pr-4 text-[#9C9AAE]">{formatDate(checkout.occurredAt)}</td>
                        <td className="py-2 pr-4 text-[#F2F1F6]">{checkout.user.username}</td>
                        <td className="py-2 pr-4 text-[#9C9AAE]">{checkout.retailer}</td>
                        <td className="py-2 pr-4 text-[#F2F1F6]">{checkout.item}</td>
                        <td className="py-2 pr-4 text-[#9C9AAE]">{checkout.qtyLabel}</td>
                        <td className="py-2 pr-4 text-[#9C9AAE]">{toCurrency(checkout.price)}</td>
                        <td className="py-2 font-mono text-xs text-[#605E72]">{checkout.ticketCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

