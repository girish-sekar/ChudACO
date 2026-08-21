"use client";

import { FormEvent, useState } from "react";
import useSWR from "swr";
import { fetchJson, formatDate, type AcoAccount } from "@/lib/dashboard";

type AccountsResponse = {
  data: AcoAccount[];
};

export default function AccountsPage() {
  const { data, error, mutate } = useSWR<AccountsResponse>("/api/aco-accounts", fetchJson);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      label: String(form.get("label") ?? ""),
      retailer: String(form.get("retailer") ?? ""),
      email: String(form.get("email") ?? ""),
      imapHost: String(form.get("imapHost") ?? ""),
      imapPort: Number(form.get("imapPort") ?? 993),
      imapSecurity: String(form.get("imapSecurity") ?? "SSL/TLS"),
      password: String(form.get("password") ?? ""),
    };

    const response = await fetch("/api/aco-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      setStatusMessage("Failed to create account.");
      return;
    }

    setStatusMessage("Account added.");
    setShowForm(false);
    await mutate();
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
        setStatusMessage("IMAP test failed.");
        return;
      }

      if (payload?.success) {
        setStatusMessage("IMAP test succeeded.");
        return;
      }

      setStatusMessage(payload?.error ? `IMAP test failed: ${payload.error}` : "IMAP test failed.");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Accounts</h1>
          <p className="mt-1 text-sm text-[#9C9AAE]">Manage mailbox credentials for automation accounts.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6]"
        >
          {showForm ? "Close" : "Add account"}
        </button>
      </header>

      {showForm ? (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4 md:grid-cols-2">
          <input name="label" placeholder="Label" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input name="retailer" placeholder="Retailer" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input name="email" type="email" placeholder="Email" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input name="imapHost" placeholder="IMAP Host" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input name="imapPort" type="number" defaultValue={993} required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input name="imapSecurity" defaultValue="SSL/TLS" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
          <input name="password" type="password" placeholder="IMAP password" required className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2" />
          <button type="submit" disabled={isSubmitting} className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] md:col-span-2">
            {isSubmitting ? "Saving..." : "Save account"}
          </button>
        </form>
      ) : null}

      {statusMessage ? <p className="text-sm text-[#9C9AAE]">{statusMessage}</p> : null}
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
              <p>Password: ••••••••••••</p>
              <p className="text-xs text-[#605E72]">
                Last sync: {account.lastSyncAt ? formatDate(account.lastSyncAt) : "never"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => testImapConnection(account.id)}
              disabled={testingId === account.id}
              className="mt-4 rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60"
            >
              {testingId === account.id ? "Testing..." : "Test IMAP connection"}
            </button>
          </article>
        ))}
        {data && data.data.length === 0 ? <p className="text-sm text-[#605E72]">No ACO accounts yet.</p> : null}
      </section>
    </div>
  );
}