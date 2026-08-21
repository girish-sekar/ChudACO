"use client";

import { useState } from "react";
import useSWR from "swr";
import { Copy } from "lucide-react";
import { fetchJson, formatDate, toCurrency, type BillingEntry, type PaymentMethod } from "@/lib/dashboard";

type BillingResponse = {
  data: BillingEntry[];
  summary: {
    totalOwed: string;
    paidThisMonth: string;
    overdueCount: number;
  };
};

type PaymentMethodsResponse = {
  data: PaymentMethod[];
};

export default function BillingPage() {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const { data: billingData, error: billingError, mutate } = useSWR<BillingResponse>(
    "/api/billing",
    fetchJson,
  );
  const { data: paymentData, error: paymentError } = useSWR<PaymentMethodsResponse>(
    "/api/payment-methods",
    fetchJson,
  );

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopyMessage(`Copied ${value}`);
    setTimeout(() => setCopyMessage(null), 1500);
  }

  async function markAsPaid(id: string) {
    setMarkingId(id);
    const response = await fetch(`/api/billing/${id}/mark-paid`, { method: "POST" });
    setMarkingId(null);
    if (response.ok) {
      await mutate();
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold">Billing</h1>
        <p className="mt-1 text-sm text-[#9C9AAE]">Manage open PAS fees and payment confirmations.</p>
      </header>

      {billingError || paymentError ? <p className="text-sm text-[#FF5D5D]">Failed to load billing data.</p> : null}
      {!billingData || !paymentData ? <p className="text-sm text-[#9C9AAE]">Loading billing...</p> : null}

      {billingData && paymentData ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
              <p className="text-xs text-[#605E72]">Total owed</p>
              <p className="mt-2 font-heading text-3xl font-bold">{toCurrency(billingData.summary.totalOwed)}</p>
            </article>
            <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
              <p className="text-xs text-[#605E72]">Paid this month</p>
              <p className="mt-2 font-heading text-3xl font-bold">{toCurrency(billingData.summary.paidThisMonth)}</p>
            </article>
            <article className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
              <p className="text-xs text-[#605E72]">Overdue entries</p>
              <p className="mt-2 font-heading text-3xl font-bold">{billingData.summary.overdueCount}</p>
            </article>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            {paymentData.data.map((method) => (
              <article key={method.id} className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
                <p className="font-heading text-xl font-semibold">{method.label}</p>
                <p className="mt-2 text-sm text-[#9C9AAE]">{method.handle}</p>
                <p className="mt-1 text-xs text-[#605E72]">{method.note}</p>
                <button
                  type="button"
                  onClick={() => copy(method.handle)}
                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#2C2D3A] px-3 py-1.5 text-xs text-[#9C9AAE] hover:text-[#F2F1F6]"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </article>
            ))}
          </section>

          {copyMessage ? <p className="text-xs text-[#4ADE80]">{copyMessage}</p> : null}

          <section className="space-y-3">
            {billingData.data.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-heading text-xl font-semibold">{toCurrency(entry.feeAmount)}</p>
                    <p className="mt-1 text-sm text-[#9C9AAE]">
                      {entry.checkout?.item ?? "Manual billing entry"} • {entry.checkout?.retailer ?? "N/A"}
                    </p>
                    <p className="mt-1 text-xs text-[#605E72]">Created {formatDate(entry.createdAt)}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-xs ${
                      entry.status === "paid"
                        ? "border-[#4ADE80]/40 text-[#4ADE80]"
                        : entry.status === "overdue"
                          ? "border-[#FF5D5D]/40 text-[#FF5D5D]"
                          : "border-[#FFCB3C]/40 text-[#FFCB3C]"
                    }`}
                  >
                    {entry.status}
                  </span>
                </div>

                {entry.status !== "paid" ? (
                  <button
                    type="button"
                    onClick={() => markAsPaid(entry.id)}
                    disabled={markingId === entry.id}
                    className="mt-4 rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
                  >
                    {markingId === entry.id ? "Saving..." : "Mark as paid"}
                  </button>
                ) : null}
              </article>
            ))}
            {billingData.data.length === 0 ? <p className="text-sm text-[#605E72]">No billing entries.</p> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}