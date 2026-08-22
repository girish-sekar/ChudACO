"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  fetchJson,
  formatDate,
  toCurrency,
  type AdminBillingPendingEntry,
  type AdminCheckoutRow,
  type AdminCheckoutSummary,
} from "@/lib/dashboard";

type CheckoutsResponse = {
  data: AdminCheckoutRow[];
  summary: AdminCheckoutSummary;
};

type PendingBillingResponse = {
  data: AdminBillingPendingEntry[];
};

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AdminDashboard() {
  const now = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const date = new Date(now);
    date.setDate(date.getDate() - 30);
    return toDateInputValue(date);
  }, [now]);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(toDateInputValue(now));
  const [retailer, setRetailer] = useState("");
  const [status, setStatus] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const checkoutsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (from) {
      params.set("from", new Date(`${from}T00:00:00.000Z`).toISOString());
    }
    if (to) {
      params.set("to", new Date(`${to}T23:59:59.999Z`).toISOString());
    }
    if (retailer.trim()) {
      params.set("retailer", retailer.trim());
    }
    if (status) {
      params.set("status", status);
    }

    return `/api/admin/checkouts?${params.toString()}`;
  }, [from, retailer, status, to]);

  const {
    data: checkoutsData,
    error: checkoutsError,
    mutate: mutateCheckouts,
  } = useSWR<CheckoutsResponse>(checkoutsUrl, fetchJson);

  const {
    data: pendingData,
    error: pendingError,
    mutate: mutatePending,
  } = useSWR<PendingBillingResponse>("/api/admin/billing/pending", fetchJson);

  async function confirmBillingEntry(id: string) {
    setConfirmingId(id);

    try {
      const response = await fetch(`/api/billing/${id}/confirm`, { method: "POST" });
      if (response.ok) {
        await Promise.all([mutatePending(), mutateCheckouts()]);
      }
    } finally {
      setConfirmingId(null);
    }
  }

  async function exportCsv() {
    const response = await fetch("/api/admin/export?format=csv", { credentials: "include" });
    if (!response.ok) {
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "chudaco-export.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const summary = checkoutsData?.summary;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Admin</h1>
          <p className="mt-1 text-sm text-[#9C9AAE]">Cross-user checkout, billing, and export controls.</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6]"
        >
          Export data (CSV)
        </button>
      </header>

      <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs text-[#9C9AAE]">
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-[#9C9AAE]">
            To
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-[#9C9AAE]">
            Retailer filter
            <input
              value={retailer}
              onChange={(event) => setRetailer(event.target.value)}
              placeholder="Nike"
              className="mt-1 block w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-[#9C9AAE]">
            Status filter
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-1 block w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-2 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </label>
        </div>
      </section>

      {checkoutsError ? <p className="text-sm text-[#FF5D5D]">Failed to load admin checkouts.</p> : null}
      {pendingError ? <p className="text-sm text-[#FF5D5D]">Failed to load pending billing entries.</p> : null}

      {summary ? (
        <section className="grid gap-4 md:grid-cols-5">
          <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">Total checkouts</p>
            <p className="mt-2 font-heading text-3xl font-bold">{summary.totalCheckouts}</p>
          </article>
          <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">Success</p>
            <p className="mt-2 font-heading text-3xl font-bold text-[#4ADE80]">{summary.successCount}</p>
          </article>
          <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">Failed</p>
            <p className="mt-2 font-heading text-3xl font-bold text-[#FF5D5D]">{summary.failedCount}</p>
          </article>
          <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">Pending</p>
            <p className="mt-2 font-heading text-3xl font-bold text-[#FFCB3C]">{summary.pendingCount}</p>
          </article>
          <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">Total volume</p>
            <p className="mt-2 font-heading text-3xl font-bold">{toCurrency(summary.totalDollarVolume)}</p>
          </article>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold">Pending payment confirmations</h2>
        {pendingData?.data.map((entry) => (
          <article key={entry.id} className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-heading text-xl font-semibold">{toCurrency(entry.feeAmount)}</p>
                <p className="mt-1 text-sm text-[#9C9AAE]">
                  {entry.user.username} • {entry.checkout?.retailer ?? "N/A"} • {entry.checkout?.item ?? "Manual entry"}
                </p>
                <p className="mt-1 text-xs text-[#605E72]">
                  Marked paid: {entry.paidMarkedAt ? formatDate(entry.paidMarkedAt) : "Unknown"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void confirmBillingEntry(entry.id)}
                disabled={confirmingId === entry.id}
                className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
              >
                {confirmingId === entry.id ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </article>
        ))}
        {pendingData && pendingData.data.length === 0 ? (
          <p className="text-sm text-[#605E72]">No pending confirmations.</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold">Checkout rows</h2>
        {checkoutsData?.data.map((row) => (
          <article key={row.id} className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-heading text-lg font-semibold">{row.item}</p>
                <p className="text-sm text-[#9C9AAE]">
                  {row.retailer} • {toCurrency(row.price)} • {row.user.username}
                </p>
                <p className="text-xs text-[#605E72]">
                  Account: {row.acoAccount?.label ?? "n/a"} • {formatDate(row.occurredAt)}
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-1 text-xs ${
                  row.status === "success"
                    ? "border-[#4ADE80]/40 text-[#4ADE80]"
                    : row.status === "failed"
                      ? "border-[#FF5D5D]/40 text-[#FF5D5D]"
                      : "border-[#FFCB3C]/40 text-[#FFCB3C]"
                }`}
              >
                {row.status}
              </span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
