"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowLeft, ArrowRight, History } from "lucide-react";
import { fetchJson } from "@/lib/dashboard";

type Pull = {
  id: string;
  acoAccountId: string | null;
  accountNumber: number;
  retailer: string;
  exportType: string;
  createdAt: string;
};

export type AccountPullsResponse = {
  data: Pull[];
  latest: Pull[];
  nextCursor: string | null;
  notifyOnAccountPull: boolean;
};

export function latestAccountPull(latest: Pull[], accountId: string, retailer: string): Pull | undefined {
  const key = (value: string) => {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    return ["pkc", "pokémon center", "pokemoncenter"].includes(normalized) ? "pokemon center"
      : normalized === "bestbuy" ? "best buy"
      : ["sams club", "sam club"].includes(normalized) ? "sam's club" : normalized;
  };
  return latest.find((pull) => pull.acoAccountId === accountId && key(pull.retailer) === key(retailer));
}

export function AccountPullActivity({ data, error, onRefresh }: {
  data?: AccountPullsResponse;
  error: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data: page, error: pageError } = useSWR<AccountPullsResponse>(
    cursor ? `/api/account-pulls?cursor=${encodeURIComponent(cursor)}` : null, fetchJson,
  );
  const current = cursor ? page : data;

  async function setNotifications(enabled: boolean) {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyOnAccountPull: enabled }),
      });
      if (!response.ok) throw new Error("Unable to save notification preference.");
      await onRefresh();
    } catch {
      setSaveError("Unable to save notification preference.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Account pulls" className="border-y border-[#2C2D3A] py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold"><History size={16} aria-hidden="true" />Account pulls</h2>
        <label className="flex items-center gap-2 text-xs text-[#A9B8CE]">
          <input type="checkbox" checked={data?.notifyOnAccountPull ?? true} disabled={!data || saving}
            onChange={(event) => void setNotifications(event.target.checked)} className="accent-[#2F5BFF]" />
          Discord DMs for account pulls
        </label>
      </div>
      {saveError ? <p role="alert" className="mt-2 text-sm text-[#FF5D5D]">{saveError}</p> : null}
      <details className="mt-3" onToggle={(event) => { if (event.currentTarget.open) void onRefresh(); }}>
        <summary className="cursor-pointer text-sm text-[#A9B8CE]">Pull history</summary>
        {error || pageError ? <p role="alert" className="mt-3 text-sm text-[#FF5D5D]">Unable to load account pulls.</p>
          : !current ? <p className="mt-3 text-sm text-[#9C9AAE]">Loading pulls...</p>
          : current.data.length === 0 ? <p className="mt-3 text-sm text-[#9C9AAE]">No account pulls recorded.</p>
          : <ul className="mt-3 divide-y divide-[#2C2D3A]">
            {current.data.map((pull) => <li key={pull.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <span className="min-w-0 break-words">#{pull.accountNumber} <span className="text-[#DDF8FF]">{pull.retailer}</span> <span className="text-xs text-[#9C9AAE]">{pull.exportType === "imap" ? "IMAP" : pull.exportType}</span></span>
              <time dateTime={pull.createdAt} className="text-xs text-[#9C9AAE]">{new Date(pull.createdAt).toLocaleString()}</time>
            </li>)}
          </ul>}
        <div className="mt-3 flex gap-2">
          {cursor ? <button type="button" title="Newest pulls" aria-label="Newest pulls" onClick={() => setCursor(null)} className="rounded border border-[#2C2D3A] p-2"><ArrowLeft size={16} /></button> : null}
          {current?.nextCursor ? <button type="button" title="Older pulls" aria-label="Older pulls" onClick={() => setCursor(current.nextCursor)} className="rounded border border-[#2C2D3A] p-2"><ArrowRight size={16} /></button> : null}
        </div>
      </details>
    </section>
  );
}