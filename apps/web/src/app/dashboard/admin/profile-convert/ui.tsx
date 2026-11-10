"use client";

import { useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";

type OutputFormat = "shikari" | "valor" | "polar";

const OUTPUT_FORMATS: Array<{ value: OutputFormat; label: string; filename: string }> = [
  { value: "shikari", label: "Shikari CSV", filename: "shikari-profiles.csv" },
  { value: "valor", label: "Valor JSON", filename: "valor-profiles.json" },
  { value: "polar", label: "PolarAIO JSON", filename: "polar-profiles.json" },
];

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

export default function ProfileConvertDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [format, setFormat] = useState<OutputFormat>("shikari");
  const [converting, setConverting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedEmails = useMemo(() => parseEmailInput(emailInput), [emailInput]);

  async function runConvert() {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!file) {
      setErrorMessage("Choose a Valor JSON or Shikari CSV file first.");
      return;
    }

    setConverting(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("format", format);
      body.set("emails", parsedEmails.join("\n"));

      const response = await fetch("/api/admin/profile-convert", {
        method: "POST",
        credentials: "include",
        body,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Conversion failed.");
      }

      const summary = response.headers.get("X-Convert-Summary");
      const blob = await response.blob();
      const fallback = OUTPUT_FORMATS.find((option) => option.value === format)?.filename ?? "profiles.txt";
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = /filename=([^;]+)/.exec(disposition)?.[1]?.trim() || fallback;

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setStatusMessage(summary ? decodeURIComponent(summary) : `Downloaded ${filename}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Profile converter</h1>
          <p className="mt-1 text-sm text-[#9C9AAE]">
            Upload a Valor or Shikari profile file, optionally filter by email, and convert to another format.
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
            <label htmlFor="profile-convert-file" className="text-sm text-[#9C9AAE]">
              Source file (Valor JSON or Shikari CSV)
            </label>
            <input
              id="profile-convert-file"
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setStatusMessage(null);
                setErrorMessage(null);
              }}
              className="mt-2 w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6] file:mr-3 file:rounded file:border-0 file:bg-[#2F5BFF] file:px-3 file:py-1 file:text-sm file:text-[#F2F1F6]"
            />
          </div>
          <div>
            <label htmlFor="profile-convert-format" className="text-sm text-[#9C9AAE]">
              Output format
            </label>
            <select
              id="profile-convert-format"
              value={format}
              onChange={(event) => setFormat(event.target.value as OutputFormat)}
              className="mt-2 w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"
            >
              {OUTPUT_FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <label htmlFor="profile-convert-emails" className="text-sm text-[#9C9AAE]">
            Emails to keep (one per line, or separated by commas/spaces — leave empty to convert everything)
          </label>
          <span className="text-sm text-[#9C9AAE]">{parsedEmails.length} parsed</span>
        </div>
        <textarea
          id="profile-convert-emails"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          rows={10}
          placeholder={"user1@example.com\nuser2@example.com"}
          className="mt-2 w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 font-mono text-sm text-[#F2F1F6]"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runConvert()}
            disabled={converting || !file}
            className="inline-flex items-center gap-2 rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {converting ? "Converting..." : "Convert & download"}
          </button>
          {file ? (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setStatusMessage(null);
                setErrorMessage(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6]"
            >
              Clear file
            </button>
          ) : null}
        </div>

        {statusMessage ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-[#9C9AAE]">{statusMessage}</p>
        ) : null}
        {errorMessage ? <p className="mt-3 text-sm text-red-400">{errorMessage}</p> : null}
      </section>
    </div>
  );
}
