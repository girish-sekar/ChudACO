"use client";

import { FormEvent, useEffect, useState } from "react";
import useSWR from "swr";
import { fetchJson, formatDate, type AcoAccount } from "@/lib/dashboard";

type AccountsResponse = {
  data: AcoAccount[];
};

type StatusBanner = {
  message: string;
  tone: "success" | "error" | "info";
  prefix?: string;
  pulse?: boolean;
};

type FormState = {
  label: string;
  retailer: string;
  email: string;
  loginEmail: string;
  imapHost: string;
  imapPort: string;
  imapSecurity: string;
  password: string;
  loginPassword: string;
  status: "active" | "locked" | "banned";
};

const defaultFormState: FormState = {
  label: "",
  retailer: "",
  email: "",
  loginEmail: "",
  imapHost: "",
  imapPort: "993",
  imapSecurity: "SSL/TLS",
  password: "",
  loginPassword: "",
  status: "active",
};

export default function AccountsPage() {
  const { data, error, mutate } = useSWR<AccountsResponse>("/api/aco-accounts", fetchJson);
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [showSuccessPulse, setShowSuccessPulse] = useState(false);

  useEffect(() => {
    if (!statusBanner?.pulse) {
      setShowSuccessPulse(false);
      return;
    }

    setShowSuccessPulse(true);
    const timeoutId = setTimeout(() => {
      setShowSuccessPulse(false);
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [statusBanner]);

  function resetForm() {
    setFormState(defaultFormState);
    setEditingId(null);
    setShowForm(false);
  }

  function startCreate() {
    setStatusBanner(null);
    setEditingId(null);
    setFormState(defaultFormState);
    setShowForm((value) => !value || editingId !== null);
  }

  function startEdit(account: AcoAccount) {
    setStatusBanner(null);
    setEditingId(account.id);
    setFormState({
      label: account.label,
      retailer: account.retailer,
      email: account.email,
      loginEmail: account.loginEmail ?? "",
      imapHost: account.imapHost,
      imapPort: String(account.imapPort),
      imapSecurity: account.imapSecurity,
      password: "",
      loginPassword: "",
      status: account.status,
    });
    setShowForm(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const payload = {
      label: formState.label,
      retailer: formState.retailer,
      email: formState.email,
      loginEmail: formState.loginEmail,
      imapHost: formState.imapHost,
      imapPort: Number(formState.imapPort),
      imapSecurity: formState.imapSecurity,
      password: formState.password,
      loginPassword: formState.loginPassword,
      status: formState.status,
    };

    const response = await fetch(editingId ? `/api/aco-accounts/${editingId}` : "/api/aco-accounts", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      setStatusBanner({
        message: editingId ? "Failed to update account." : "Failed to create account.",
        tone: "error",
      });
      return;
    }

    setStatusBanner({
      message: editingId ? "Account updated." : "Account added.",
      tone: "success",
    });
    resetForm();
    await mutate();
  }

  async function deleteAccount(id: string) {
    setDeletingId(id);

    try {
      const response = await fetch(`/api/aco-accounts/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setStatusBanner({ message: "Failed to delete account.", tone: "error" });
        return;
      }

      if (editingId === id) {
        resetForm();
      }

      setStatusBanner({ message: "Account deleted.", tone: "success" });
      await mutate();
    } finally {
      setDeletingId(null);
    }
  }

  async function testImapConnection(id: string) {
    setTestingId(id);

    try {
      const response = await fetch(`/api/aco-accounts/${id}/test`, {
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!response.ok) {
        setStatusBanner({
          message: "IMAP test failed.",
          tone: "error",
          prefix: "IMAP TEST FAILED:",
        });
        return;
      }

      if (payload?.success) {
        setStatusBanner({
          message: "IMAP test succeeded.",
          tone: "success",
          prefix: "IMAP TEST PASSED:",
          pulse: true,
        });
        return;
      }

      setStatusBanner({
        message: payload?.error ? `IMAP test failed: ${payload.error}` : "IMAP test failed.",
        tone: "error",
        prefix: "IMAP TEST FAILED:",
      });
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Accounts</h1>
          <p className="mt-1 text-sm text-[#9C9AAE]">Manage IMAP inboxes and retailer login credentials for automation accounts.</p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6]"
        >
          {showForm && editingId === null ? "Close" : "Add account"}
        </button>
      </header>

      {showForm ? (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4 md:grid-cols-2">
          <input value={formState.label} onChange={(event) => setFormState((current) => ({ ...current, label: event.target.value }))} placeholder="Label" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input value={formState.retailer} onChange={(event) => setFormState((current) => ({ ...current, retailer: event.target.value }))} placeholder="Retailer" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input value={formState.email} onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))} type="email" placeholder="IMAP email" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input value={formState.loginEmail} onChange={(event) => setFormState((current) => ({ ...current, loginEmail: event.target.value }))} type="email" placeholder="Retail login email" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input value={formState.imapHost} onChange={(event) => setFormState((current) => ({ ...current, imapHost: event.target.value }))} placeholder="IMAP Host" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input value={formState.imapPort} onChange={(event) => setFormState((current) => ({ ...current, imapPort: event.target.value }))} type="number" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input value={formState.imapSecurity} onChange={(event) => setFormState((current) => ({ ...current, imapSecurity: event.target.value }))} placeholder="IMAP security" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <select value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as FormState["status"] }))} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm">
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="banned">Banned</option>
          </select>
          <input value={formState.password} onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))} type="password" placeholder={editingId ? "New IMAP password (leave blank to keep current)" : "IMAP password"} required={!editingId} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2" />
          <input value={formState.loginPassword} onChange={(event) => setFormState((current) => ({ ...current, loginPassword: event.target.value }))} type="password" placeholder={editingId ? "New retail login password (leave blank to keep current)" : "Retail login password"} required={!editingId} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2" />
          <div className="flex flex-col gap-3 md:col-span-2 md:flex-row">
            <button type="submit" disabled={isSubmitting} className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6]">
              {isSubmitting ? "Saving..." : editingId ? "Save changes" : "Save account"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE]">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {statusBanner ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition-all ${
            statusBanner.tone === "success"
              ? "border-[#4ADE80]/70 bg-[#10281A] text-[#9DFFBE]"
              : statusBanner.tone === "error"
                ? "border-[#FF5D5D]/70 bg-[#2A1317] text-[#FFC0C0]"
                : "border-[#4C79FF]/70 bg-[#111B38] text-[#C8D8FF]"
          } ${showSuccessPulse ? "animate-[pulse_1s_ease-in-out_2] shadow-[0_0_0_1px_rgba(74,222,128,0.2),0_0_22px_rgba(74,222,128,0.45)]" : ""}`}
          role="status"
          aria-live="polite"
        >
          {statusBanner.prefix ? `${statusBanner.prefix} ` : ""}
          {statusBanner.message}
        </div>
      ) : null}
      {error ? <p className="text-sm text-[#FF5D5D]">Failed to load accounts.</p> : null}
      {!data ? <p className="text-sm text-[#9C9AAE]">Loading accounts...</p> : null}

      <section className="space-y-3">
        {data?.data.map((account) => (
          <article key={account.id} className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-heading text-xl font-semibold">{account.label}</p>
                <p className="mt-1 text-sm text-[#9C9AAE]">
                  {account.retailer} • {account.email}
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-1 text-xs ${
                  account.status === "active"
                    ? "border-[#4ADE80]/40 text-[#4ADE80]"
                    : account.status === "locked"
                      ? "border-[#FFCB3C]/40 text-[#FFCB3C]"
                      : "border-[#FF5D5D]/40 text-[#FF5D5D]"
                }`}
              >
                {account.status}
              </span>
            </div>

            <div className="mt-3 grid gap-1 text-sm text-[#9C9AAE]">
              <p>
                IMAP: {account.imapHost}:{account.imapPort} ({account.imapSecurity})
              </p>
              <p>IMAP login: {account.email}</p>
              <p>Retail login: {account.loginEmail ?? "not set yet"}</p>
              <p>Passwords: •••••••••••• / ••••••••••••</p>
              <p className="text-xs text-[#605E72]">
                Last sync: {account.lastSyncAt ? formatDate(account.lastSyncAt) : "never"}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => testImapConnection(account.id)}
                disabled={testingId === account.id}
                className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60"
              >
                {testingId === account.id ? "Testing..." : "Test IMAP connection"}
              </button>
              <button
                type="button"
                onClick={() => startEdit(account)}
                className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => deleteAccount(account.id)}
                disabled={deletingId === account.id}
                className="rounded-md border border-[#5A2323] px-3 py-2 text-sm text-[#FF9A9A] hover:text-[#FFD1D1] disabled:opacity-60"
              >
                {deletingId === account.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </article>
        ))}
        {data && data.data.length === 0 ? <p className="text-sm text-[#605E72]">No ACO accounts yet.</p> : null}
      </section>
    </div>
  );
}