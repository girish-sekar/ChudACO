"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import useSWR from "swr";
import { fetchJson } from "@/lib/dashboard";

type RetailerOptionsResponse = {
  data: Array<{
    retailer?: string;
    acoRetailer?: string;
    acoRetailerLogins?: string[];
  }>;
};

type MatchedAccount = {
  accountId: string;
  label: string;
  botProfileName: string;
  retailer: string;
  loginEmail: string | null;
};

type LookupResponse = {
  retailer: string;
  matched: MatchedAccount[];
  accountIds: string[];
  unmatched: string[];
};

type ExportKind =
  | "accounts-txt"
  | "imap-txt"
  | "valor-json"
  | "shikari-accounts"
  | "shikari-imap"
  | "shikari-profiles"
  | "hayha-json"
  | "stellar-json";

function parseEmailInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.includes("@")),
    ),
  );
}

export default function EmailExportDashboard() {
  const [retailer, setRetailer] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: retailerOptionsData } = useSWR<RetailerOptionsResponse>(
    "/api/admin/export?format=json",
    fetchJson,
  );

  const retailerOptions = useMemo(() => {
    const rows = retailerOptionsData?.data ?? [];
    const rawOptions = rows.flatMap((row) => {
      const primary = (row.retailer ?? row.acoRetailer ?? "").trim();
      const additional = (row.acoRetailerLogins ?? []).map((value) => value.trim());
      return [primary, ...additional];
    });

    const normalized = rawOptions
      .map((value) => {
        const lower = value.toLowerCase();
        if (lower === "pkc" || lower === "pokémon center" || lower === "pokemoncenter") {
          return "Pokemon Center";
        }
        return value;
      })
      .filter((value) => value.length > 0);

    return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
  }, [retailerOptionsData]);

  const parsedEmails = useMemo(() => parseEmailInput(emailInput), [emailInput]);
  const matchedAccountIds = lookupResult?.accountIds ?? [];

  async function runLookup() {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!retailer) {
      setErrorMessage("Select a retailer first.");
      return;
    }
    if (parsedEmails.length === 0) {
      setErrorMessage("Paste at least one email address.");
      return;
    }

    setLookingUp(true);
    try {
      const response = await fetch("/api/admin/export/email-lookup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retailer, emails: parsedEmails }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Email lookup failed.");
      }

      const payload = (await response.json()) as LookupResponse;
      setLookupResult(payload);
      setStatusMessage(
        `Matched ${payload.matched.length} account${payload.matched.length === 1 ? "" : "s"}` +
          (payload.unmatched.length > 0 ? `; ${payload.unmatched.length} email(s) had no match.` : "."),
      );
    } catch (error) {
      setLookupResult(null);
      setErrorMessage(error instanceof Error ? error.message : "Email lookup failed.");
    } finally {
      setLookingUp(false);
    }
  }

  function buildParams(extra?: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams();
    params.set("retailers", retailer);
    if (matchedAccountIds.length > 0) {
      params.set("accountIds", matchedAccountIds.join(","));
    }
    for (const [key, value] of Object.entries(extra ?? {})) {
      params.set(key, value);
    }
    return params;
  }

  async function download(url: string, filename: string, init?: RequestInit) {
    const response = await fetch(url, { credentials: "include", ...init });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string }
        | null;
      const message = payload?.detail
        ? `${payload?.error ?? "Export failed"}: ${payload.detail}`
        : payload?.error ?? "Export failed";
      throw new Error(message);
    }

    const warning = response.headers.get("X-Export-Warning");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return warning ? decodeURIComponent(warning) : null;
  }

  function requireSelection(): boolean {
    if (!retailer) {
      setErrorMessage("Select a retailer first.");
      return false;
    }
    if (!lookupResult || matchedAccountIds.length === 0) {
      setErrorMessage("Run the email lookup and match at least one account before exporting.");
      return false;
    }
    return true;
  }

  async function runExport(kind: ExportKind) {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!requireSelection()) {
      return;
    }

    setExporting(kind);
    const postHeaders = { "X-Export-Action": crypto.randomUUID() };

    try {
      let warning: string | null = null;
      if (kind === "accounts-txt" || kind === "imap-txt") {
        const params = buildParams({ category: "valor", mode: kind === "imap-txt" ? "imap" : "default" });
        await download(`/api/admin/export/accounts-txt?${params.toString()}`, kind === "imap-txt" ? "valor-imap.txt" : "valor-accounts.txt", {
          method: "POST",
          headers: { ...postHeaders, "X-Export-Parts": "1" },
        });
      } else if (kind === "valor-json") {
        await download(`/api/admin/export/valor-json?${buildParams().toString()}`, "valor-accounts.json", {
          method: "POST",
          headers: postHeaders,
        });
      } else if (kind === "hayha-json") {
        await download(`/api/admin/export/target-json?${buildParams().toString()}`, "hayha-accounts.json", {
          method: "POST",
          headers: postHeaders,
        });
      } else if (kind === "stellar-json") {
        await download(`/api/admin/export/pokemon-center-json?${buildParams().toString()}`, "stellar-accounts.json", {
          method: "POST",
          headers: postHeaders,
        });
      } else {
        const mode = kind.replace("shikari-", "");
        warning = await download(`/api/admin/export/shikari?${buildParams({ mode }).toString()}`, mode === "accounts" ? "shikari-accounts.txt" : `shikari-${mode}.csv`, {
          method: "POST",
          headers: postHeaders,
        });
      }
      if (warning) {
        setStatusMessage(warning);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  const exportDisabled = exporting !== null || lookingUp || matchedAccountIds.length === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Email-based export</h1>
          <p className="mt-1 text-sm text-[#9C9AAE]">
            Paste retailer login emails to select accounts, then generate export files.
          </p>
        </div>
        <a
          href="/dashboard/admin"
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6]"
        >
          Back to admin
        </a>
      </header>

      <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="email-export-retailer" className="text-sm text-[#9C9AAE]">
              Retailer
            </label>
            <select
              id="email-export-retailer"
              value={retailer}
              onChange={(event) => {
                setRetailer(event.target.value);
                setLookupResult(null);
              }}
              className="mt-2 w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"
            >
              <option value="">Select a retailer</option>
              {retailerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-sm text-[#9C9AAE]">Parsed emails</p>
            <p className="mt-2 rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]">
              {parsedEmails.length}
            </p>
          </div>
        </div>

        <label htmlFor="email-export-emails" className="mt-4 block text-sm text-[#9C9AAE]">
          Retailer login emails (one per line, or separated by commas/spaces)
        </label>
        <textarea
          id="email-export-emails"
          value={emailInput}
          onChange={(event) => {
            setEmailInput(event.target.value);
            setLookupResult(null);
          }}
          rows={10}
          placeholder={"user1@example.com\nuser2@example.com"}
          className="mt-2 w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 font-mono text-sm text-[#F2F1F6]"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runLookup()}
            disabled={lookingUp || !retailer || parsedEmails.length === 0}
            className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
          >
            {lookingUp ? "Looking up..." : "Find matching accounts"}
          </button>
          {lookupResult ? (
            <button
              type="button"
              onClick={() => {
                setLookupResult(null);
                setStatusMessage(null);
              }}
              className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6]"
            >
              Clear selection
            </button>
          ) : null}
        </div>

        {statusMessage ? <p className="mt-3 text-sm text-[#9C9AAE]">{statusMessage}</p> : null}
        {errorMessage ? <p className="mt-3 text-sm text-[#FF7A7A]">{errorMessage}</p> : null}

        {lookupResult ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-[#F2F1F6]">
                Matched accounts ({lookupResult.matched.length})
              </p>
              <ul className="mt-2 max-h-72 overflow-y-auto rounded-md border border-[#2C2D3A] bg-[#101014] p-2">
                {lookupResult.matched.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-[#605E72]">No accounts matched.</li>
                ) : (
                  lookupResult.matched.map((entry) => (
                    <li key={entry.accountId} className="rounded px-2 py-1.5 text-sm text-[#F2F1F6]">
                      <span>{entry.botProfileName}</span>{" "}
                      <span className="text-xs text-[#605E72]">
                        {entry.loginEmail ?? "no email"} · {entry.label}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F2F1F6]">
                Unmatched emails ({lookupResult.unmatched.length})
              </p>
              <ul className="mt-2 max-h-72 overflow-y-auto rounded-md border border-[#2C2D3A] bg-[#101014] p-2">
                {lookupResult.unmatched.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-[#605E72]">Every email matched an account.</li>
                ) : (
                  lookupResult.unmatched.map((email) => (
                    <li key={email} className="rounded px-2 py-1.5 font-mono text-xs text-[#9C9AAE]">
                      {email}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      <section aria-label="Export files" className="grid min-w-0 grid-cols-1 gap-6 border-y border-[#2C2D3A] py-4 sm:grid-cols-2 xl:grid-cols-4">
        <fieldset className="min-w-0">
          <legend className="mb-3 text-sm font-semibold text-[#F2F1F6]">Valor</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runExport("accounts-txt")}
              disabled={exportDisabled}
              className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
            >
              {exporting === "accounts-txt" ? "Exporting..." : "Accounts (.txt)"}
            </button>
            <button
              type="button"
              onClick={() => void runExport("imap-txt")}
              disabled={exportDisabled}
              className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
            >
              {exporting === "imap-txt" ? "Exporting..." : "IMAP (.txt)"}
            </button>
            <button
              type="button"
              onClick={() => void runExport("valor-json")}
              disabled={exportDisabled}
              className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60"
            >
              {exporting === "valor-json" ? "Exporting..." : "Profile (.json)"}
            </button>
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-3 text-sm font-semibold text-[#F2F1F6]">Shikari</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runExport("shikari-accounts")}
              disabled={exportDisabled}
              className="inline-flex items-center gap-2 rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60"
            >
              <Download size={16} aria-hidden="true" className="shrink-0" />
              {exporting === "shikari-accounts" ? "Exporting..." : "Accounts (.txt)"}
            </button>
            <button
              type="button"
              onClick={() => void runExport("shikari-imap")}
              disabled={exportDisabled}
              className="inline-flex items-center gap-2 rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60"
            >
              <Download size={16} aria-hidden="true" className="shrink-0" />
              {exporting === "shikari-imap" ? "Exporting..." : "IMAP (.csv)"}
            </button>
            <button
              type="button"
              onClick={() => void runExport("shikari-profiles")}
              disabled={exportDisabled}
              className="inline-flex items-center gap-2 rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60"
            >
              <Download size={16} aria-hidden="true" className="shrink-0" />
              {exporting === "shikari-profiles" ? "Exporting..." : "Profiles (.csv)"}
            </button>
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-3 text-sm font-semibold text-[#F2F1F6]">Hayha</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runExport("hayha-json")}
              disabled={exportDisabled}
              className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60"
            >
              {exporting === "hayha-json" ? "Exporting..." : "Profile (.json)"}
            </button>
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-3 text-sm font-semibold text-[#F2F1F6]">Stellar</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runExport("stellar-json")}
              disabled={exportDisabled}
              className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60"
            >
              {exporting === "stellar-json" ? "Exporting..." : "Profile (.json)"}
            </button>
          </div>
        </fieldset>
      </section>

      <p className="text-xs text-[#605E72]">
        Exports use the matched accounts above and the selected retailer. Run the lookup again after editing
        the email list or changing the retailer.
      </p>
    </div>
  );
}
