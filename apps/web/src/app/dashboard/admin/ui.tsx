"use client";

import { FormEvent, useMemo, useState } from "react";
import useSWR from "swr";
import {
  fetchJson,
  formatDate,
  toCurrency,
  type AdminBillingPendingEntry,
  type AdminCheckoutRow,
  type AdminCheckoutSummary,
  type PricingRule,
} from "@/lib/dashboard";

type CheckoutsResponse = {
  data: AdminCheckoutRow[];
  summary: AdminCheckoutSummary;
};

type PendingBillingResponse = {
  data: AdminBillingPendingEntry[];
};

type RetailerOptionsResponse = {
  data: Array<{
    retailer?: string;
    acoRetailer?: string;
    acoRetailerLogins?: string[];
  }>;
};

type PricingRulesResponse = {
  data: PricingRule[];
};

type PricingRuleFormState = {
  category: string;
  priceRangeLabel: string;
  feeType: "flat" | "percent";
  feeFlat: string;
  feePercent: string;
  minPrice: string;
  maxPrice: string;
  sortOrder: string;
};

const defaultPricingRuleForm: PricingRuleFormState = {
  category: "",
  priceRangeLabel: "",
  feeType: "flat",
  feeFlat: "",
  feePercent: "",
  minPrice: "",
  maxPrice: "",
  sortOrder: "0",
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
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [isExportingTxt, setIsExportingTxt] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pricingForm, setPricingForm] = useState<PricingRuleFormState>(defaultPricingRuleForm);
  const [pricingStatus, setPricingStatus] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [editingPricingRuleId, setEditingPricingRuleId] = useState<string | null>(null);
  const [savingPricingRule, setSavingPricingRule] = useState(false);
  const [deletingPricingRuleId, setDeletingPricingRuleId] = useState<string | null>(null);

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

  const { data: retailerOptionsData } = useSWR<RetailerOptionsResponse>(
    "/api/admin/export?format=json",
    fetchJson,
  );

  const {
    data: pricingRulesData,
    error: pricingRulesError,
    mutate: mutatePricingRules,
  } = useSWR<PricingRulesResponse>("/api/admin/pricing-rules", fetchJson);

  const retailerOptions = useMemo(() => {
    const rows = retailerOptionsData?.data ?? [];
    return Array.from(
      new Set(
        rows
          .flatMap((row) => {
            const primary = (row.retailer ?? row.acoRetailer ?? "").trim();
            const additional = (row.acoRetailerLogins ?? []).map((value) => value.trim());
            return [primary, ...additional];
          })
          .filter((value) => value.length > 0),
      ),
    );
  }, [retailerOptionsData]);

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

  function toggleRetailerSelection(retailerValue: string) {
    setSelectedRetailers((current) =>
      current.includes(retailerValue)
        ? current.filter((value) => value !== retailerValue)
        : [...current, retailerValue],
    );
  }

  async function exportAccountsTxt() {
    setIsExportingTxt(true);
    setExportError(null);

    try {
      const params = new URLSearchParams();
      if (selectedRetailers.length > 0) {
        params.set("retailers", selectedRetailers.join(","));
      }

      const response = await fetch(
        `/api/admin/export/accounts-txt${params.toString() ? `?${params.toString()}` : ""}`,
        { credentials: "include" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; detail?: string }
          | null;
        const message = payload?.detail
          ? `${payload?.error ?? "Export failed"}: ${payload.detail}`
          : payload?.error ?? "Export failed";
        setExportError(message);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "admin-account-export.txt";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingTxt(false);
    }
  }

  function startEditPricingRule(rule: PricingRule) {
    setEditingPricingRuleId(rule.id);
    setPricingError(null);
    setPricingStatus(null);
    setPricingForm({
      category: rule.category,
      priceRangeLabel: rule.priceRangeLabel,
      feeType: rule.feeType,
      feeFlat: rule.feeFlat ?? "",
      feePercent: rule.feePercent ?? "",
      minPrice: rule.minPrice ?? "",
      maxPrice: rule.maxPrice ?? "",
      sortOrder: String(rule.sortOrder),
    });
  }

  function resetPricingForm() {
    setEditingPricingRuleId(null);
    setPricingForm(defaultPricingRuleForm);
  }

  async function submitPricingRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPricingRule(true);
    setPricingStatus(null);
    setPricingError(null);

    const payload = {
      category: pricingForm.category,
      priceRangeLabel: pricingForm.priceRangeLabel,
      feeType: pricingForm.feeType,
      feeFlat: pricingForm.feeFlat || null,
      feePercent: pricingForm.feePercent || null,
      minPrice: pricingForm.minPrice || null,
      maxPrice: pricingForm.maxPrice || null,
      sortOrder: Number(pricingForm.sortOrder),
    };

    const response = await fetch(
      editingPricingRuleId
        ? `/api/admin/pricing-rules/${editingPricingRuleId}`
        : "/api/admin/pricing-rules",
      {
        method: editingPricingRuleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const body = (await response.json().catch(() => null)) as
      | { error?: string; details?: unknown }
      | null;

    if (!response.ok) {
      setPricingError(
        body?.error ??
          (editingPricingRuleId ? "Failed to update pricing rule." : "Failed to create pricing rule."),
      );
      setSavingPricingRule(false);
      return;
    }

    setPricingStatus(editingPricingRuleId ? "Pricing rule updated." : "Pricing rule created.");
    resetPricingForm();
    await mutatePricingRules();
    setSavingPricingRule(false);
  }

  async function deletePricingRule(id: string) {
    const confirmed = window.confirm("Delete this pricing rule?");
    if (!confirmed) {
      return;
    }

    setDeletingPricingRuleId(id);
    setPricingError(null);
    setPricingStatus(null);

    try {
      const response = await fetch(`/api/admin/pricing-rules/${id}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setPricingError(body?.error ?? "Failed to delete pricing rule.");
        return;
      }

      setPricingStatus("Pricing rule deleted.");
      if (editingPricingRuleId === id) {
        resetPricingForm();
      }
      await mutatePricingRules();
    } finally {
      setDeletingPricingRuleId(null);
    }
  }

  const summary = checkoutsData?.summary;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Admin</h1>
          <p className="mt-1 text-sm text-[#9C9AAE]">Cross-user checkout, billing, and export controls.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6]"
          >
            Export data (CSV)
          </button>
          <button
            type="button"
            onClick={exportAccountsTxt}
            disabled={isExportingTxt}
            className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
          >
            {isExportingTxt ? "Exporting..." : "Export Accounts (.txt)"}
          </button>
        </div>
      </header>

      <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
        <p className="text-sm text-[#9C9AAE]">TXT export retailer filter</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {retailerOptions.length === 0 ? (
            <p className="text-xs text-[#605E72]">No retailers found yet.</p>
          ) : (
            retailerOptions.map((retailerValue) => {
              const isSelected = selectedRetailers.includes(retailerValue);
              return (
                <button
                  key={retailerValue}
                  type="button"
                  onClick={() => toggleRetailerSelection(retailerValue)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    isSelected
                      ? "border-[#4C79FF] bg-[#1A2759] text-[#C8D8FF]"
                      : "border-[#2C2D3A] text-[#9C9AAE]"
                  }`}
                >
                  {retailerValue}
                </button>
              );
            })
          )}
        </div>
        <p className="mt-2 text-xs text-[#605E72]">
          {selectedRetailers.length === 0
            ? "No retailer selected: export will include all retailers."
            : `Selected retailers: ${selectedRetailers.join(", ")}`}
        </p>
        {exportError ? <p className="mt-2 text-xs text-[#FF5D5D]">{exportError}</p> : null}
      </section>

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
        <h2 className="font-heading text-2xl font-semibold">Pricing rules</h2>
        {pricingRulesError ? <p className="text-sm text-[#FF5D5D]">Failed to load pricing rules.</p> : null}

        <form
          onSubmit={(event) => void submitPricingRule(event)}
          className="grid gap-2 rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4 md:grid-cols-4"
        >
          <input
            value={pricingForm.category}
            onChange={(event) =>
              setPricingForm((current) => ({ ...current, category: event.target.value }))
            }
            placeholder="Category"
            required
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={pricingForm.priceRangeLabel}
            onChange={(event) =>
              setPricingForm((current) => ({ ...current, priceRangeLabel: event.target.value }))
            }
            placeholder="Price range label"
            required
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <select
            value={pricingForm.feeType}
            onChange={(event) =>
              setPricingForm((current) => ({
                ...current,
                feeType: event.target.value as "flat" | "percent",
              }))
            }
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          >
            <option value="flat">Flat</option>
            <option value="percent">Percent</option>
          </select>
          <input
            value={pricingForm.sortOrder}
            onChange={(event) =>
              setPricingForm((current) => ({ ...current, sortOrder: event.target.value }))
            }
            placeholder="Sort order"
            required
            type="number"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={pricingForm.feeFlat}
            onChange={(event) =>
              setPricingForm((current) => ({ ...current, feeFlat: event.target.value }))
            }
            placeholder="Fee flat"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={pricingForm.feePercent}
            onChange={(event) =>
              setPricingForm((current) => ({ ...current, feePercent: event.target.value }))
            }
            placeholder="Fee percent"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={pricingForm.minPrice}
            onChange={(event) =>
              setPricingForm((current) => ({ ...current, minPrice: event.target.value }))
            }
            placeholder="Min price"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={pricingForm.maxPrice}
            onChange={(event) =>
              setPricingForm((current) => ({ ...current, maxPrice: event.target.value }))
            }
            placeholder="Max price (blank for no cap)"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <div className="md:col-span-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={savingPricingRule}
              className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
            >
              {savingPricingRule
                ? "Saving..."
                : editingPricingRuleId
                  ? "Update pricing rule"
                  : "Add pricing rule"}
            </button>
            {editingPricingRuleId ? (
              <button
                type="button"
                onClick={resetPricingForm}
                className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE]"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
          {pricingStatus ? <p className="text-xs text-[#4ADE80] md:col-span-4">{pricingStatus}</p> : null}
          {pricingError ? <p className="text-xs text-[#FF5D5D] md:col-span-4">{pricingError}</p> : null}
        </form>

        <div className="rounded-xl border border-[#2C2D3A] bg-[#18181F] overflow-hidden">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#2C2D3A] text-[#9C9AAE]">
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Range label</th>
                <th className="px-3 py-2 font-medium">Bounds</th>
                <th className="px-3 py-2 font-medium">Fee</th>
                <th className="px-3 py-2 font-medium">Sort</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(pricingRulesData?.data ?? []).map((rule) => (
                <tr key={rule.id} className="border-b border-[#2C2D3A]/70 last:border-0">
                  <td className="px-3 py-2 text-[#F2F1F6]">{rule.category}</td>
                  <td className="px-3 py-2 text-[#9C9AAE]">{rule.priceRangeLabel}</td>
                  <td className="px-3 py-2 text-[#9C9AAE]">
                    {rule.minPrice ?? "0"} - {rule.maxPrice ?? "No cap"}
                  </td>
                  <td className="px-3 py-2 text-[#F2F1F6]">
                    {rule.feeType === "flat" ? toCurrency(rule.feeFlat ?? 0) : `${rule.feePercent ?? 0}%`}
                  </td>
                  <td className="px-3 py-2 text-[#9C9AAE]">{rule.sortOrder}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEditPricingRule(rule)}
                        className="rounded-md border border-[#2C2D3A] px-2 py-1 text-xs text-[#9C9AAE] hover:text-[#F2F1F6]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deletePricingRule(rule.id)}
                        disabled={deletingPricingRuleId === rule.id}
                        className="rounded-md border border-[#5A2323] px-2 py-1 text-xs text-[#FF9A9A] hover:text-[#FFD1D1] disabled:opacity-60"
                      >
                        {deletingPricingRuleId === rule.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pricingRulesData && pricingRulesData.data.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-[#605E72]" colSpan={6}>
                    No pricing rules found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
