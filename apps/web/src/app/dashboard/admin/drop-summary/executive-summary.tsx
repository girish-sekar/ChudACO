"use client";

import Image from "next/image";
import { Copy } from "lucide-react";
import { useRef, useState } from "react";
import { toCurrency, type DropSummaryResponse } from "@/lib/dashboard";

function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function perUnitLabel(volume: string, pricedCount: number): string {
  if (pricedCount <= 0) return "Price unknown";
  const price = Number(volume) / pricedCount;
  return `~${toCurrency(price.toFixed(2))} ea`;
}

function daysInRange(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
}

type BackgroundStyle = "profile" | "day" | "night";

const backgroundOptions: Array<{ value: BackgroundStyle; label: string }> = [
  { value: "profile", label: "ChudACO" },
  { value: "day", label: "Day" },
  { value: "night", label: "Night" },
];

export default function ExecutiveSummary({ data }: { data: DropSummaryResponse }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("profile");

  const topItems = data.byItem.slice(0, 4);
  const topRetailer = data.byRetailer[0]?.retailer ?? "No retailer data";
  const maxItemVolume = Math.max(1, ...topItems.map((item) => Number(item.volume)));

  async function handleDownload() {
    const node = cardRef.current;
    if (!node) return;
    setDownloading(true);
    setDownloadError(null);
    setCopyMessage(null);
    try {
      const { toPng } = await import("html-to-image");
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      const options = {
        pixelRatio: 2,
        backgroundColor: "#0B0B10",
        width: node.scrollWidth,
        height: node.scrollHeight,
      };
      // First pass warms up image/font measurement; the browser's initial render
      // otherwise clips the bottom of the capture.
      await toPng(node, options);
      const dataUrl = await toPng(node, options);
      const link = document.createElement("a");
      link.download = `chudaco-drop-summary-${data.range.from.slice(0, 10)}-${backgroundStyle}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setDownloadError("Failed to generate image.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyImage() {
    const node = cardRef.current;
    if (!node) return;
    setCopying(true);
    setCopyMessage(null);
    setDownloadError(null);
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image clipboard is not supported by this browser.");
      }
      const { toPng } = await import("html-to-image");
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      const options = {
        pixelRatio: 2,
        backgroundColor: "#0B0B10",
        width: node.scrollWidth,
        height: node.scrollHeight,
      };
      await toPng(node, options);
      const dataUrl = await toPng(node, options);
      const imageBlob = await fetch(dataUrl).then((response) => response.blob());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": imageBlob })]);
      setCopyMessage("Image copied to clipboard");
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Failed to copy image.");
    } finally {
      setCopying(false);
    }
  }

  const backgroundImage =
    backgroundStyle === "day"
      ? "linear-gradient(rgba(9,13,25,0.5), rgba(9,13,25,0.72)), url('/images/drop-recap-day.png')"
      : backgroundStyle === "night"
        ? "linear-gradient(rgba(8,10,26,0.36), rgba(8,10,26,0.64)), url('/images/drop-recap-night.png')"
        : "radial-gradient(ellipse at 12% 8%, rgba(36,92,158,0.24), transparent 42%), radial-gradient(ellipse at 4% 88%, rgba(157,47,58,0.2), transparent 38%), linear-gradient(115deg, #11141b 0%, #14171e 56%, #18151a 100%)";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#9C9AAE]">Background</span>
          <div className="inline-flex rounded-md border border-[#393B46] bg-[#11141B] p-1" role="group" aria-label="Recap background">
            {backgroundOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={backgroundStyle === option.value}
                onClick={() => setBackgroundStyle(option.value)}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                  backgroundStyle === option.value
                    ? "bg-[#F04438] text-white"
                    : "text-[#A9ADBB] hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopyImage}
            disabled={downloading || copying}
            className="inline-flex items-center gap-2 rounded-md border border-[#F04438]/40 bg-[#17191F] px-4 py-2 text-sm font-semibold text-[#F7F4EF] hover:border-[#F04438] disabled:opacity-50"
          >
            <Copy size={16} aria-hidden="true" />
            {copying ? "Copying..." : "Copy image"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || copying}
            className="rounded-md border border-[#F04438]/40 bg-[#17191F] px-4 py-2 text-sm font-semibold text-[#F7F4EF] hover:border-[#F04438] disabled:opacity-50"
          >
            {downloading ? "Generating..." : "Download as image"}
          </button>
        </div>
      </div>
      {downloadError ? <p className="text-right text-sm text-[#FF5D5D]">{downloadError}</p> : null}
      {copyMessage ? <p role="status" className="text-right text-sm text-[#56D6AE]">{copyMessage}</p> : null}

      <div
        ref={cardRef}
        className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-[#55505A] bg-[#11141B] p-4 text-[#F7F4EF] shadow-2xl sm:p-7"
        style={{
          backgroundImage,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        {backgroundStyle === "profile" ? (
          <Image
            src="/images/setup-guide-header.png"
            alt=""
            width={320}
            height={240}
            unoptimized
            aria-hidden="true"
            className="pointer-events-none absolute -left-16 -top-16 z-0 h-72 w-80 scale-125 object-cover opacity-[0.12] blur-3xl"
          />
        ) : null}
        <div className="absolute inset-x-0 top-0 z-20 h-1 bg-gradient-to-r from-[#F04438] via-[#F5B942] to-[#56D6AE]" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Image
              src="/images/setup-guide-header.png"
              alt="ChudACO"
              width={52}
              height={52}
              unoptimized
              className="h-12 w-12 rounded-full border border-[#F04438]/70 object-cover shadow-[0_0_20px_rgba(240,68,56,0.2)]"
            />
            <div>
              <p className="font-heading text-2xl font-extrabold leading-none sm:text-3xl">Drop Recap</p>
              <p className="mt-1 text-[10px] font-bold uppercase text-[#A9ADBB]">
                ChudACO <span className="px-1 text-[#F04438]">·</span> Server-wide report
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="font-heading text-lg font-bold sm:text-2xl">{formatDayLabel(data.range.to)}</p>
            <p className="mt-1 inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase text-[#C1C4CD]">
              {daysInRange(data.range.from, data.range.to)} day{daysInRange(data.range.from, data.range.to) === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-4 grid gap-3 lg:grid-cols-[0.58fr_1fr]">
          <aside className="space-y-3">
            <div className="rounded-xl border border-[#F04438]/50 bg-[#27171A]/90 px-4 py-3">
              <p className="text-[10px] font-bold uppercase text-[#FF8178]">Top site</p>
              <p className="mt-0.5 font-heading text-xl font-extrabold">{topRetailer}</p>
            </div>
            <div className="rounded-xl border border-[#F5B942]/40 bg-[#1E1D1B]/90 p-4">
              <p className="text-[10px] font-extrabold uppercase text-[#F5B942]">Successful checkouts</p>
              <p className="mt-1 font-heading text-5xl font-black leading-none text-[#F5B942]">
                {data.totals.successfulCheckouts}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-[#A9ADBB]">
                    {data.reconciliation.configured && data.reconciliation.unpricedGapCount > 0
                      ? "Known-price volume"
                      : "Total spent"}
                  </p>
                  <p className="mt-1 font-heading text-xl font-extrabold text-[#56D6AE]">
                    {toCurrency(data.totals.totalDollarVolume)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-[#A9ADBB]">Members</p>
                  <p className="mt-1 font-heading text-xl font-extrabold">{data.totals.uniqueBuyers}</p>
                </div>
              </div>
              <p className="mt-3 border-t border-white/10 pt-2 text-[11px] text-[#A9ADBB]">
                {data.totals.uniqueRetailers} retailer{data.totals.uniqueRetailers === 1 ? "" : "s"} hit
                <span className="px-1.5 text-[#F04438]">·</span>
                {toCurrency(data.totals.averageOrderValue)} average order
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-[#20232B]/90 p-3">
                <p className="text-[10px] font-bold uppercase text-[#A9ADBB]">Units moved</p>
                <p className="mt-1 font-heading text-2xl font-extrabold text-[#9AA5FF]">
                  {data.byItem.reduce((sum, item) => sum + item.count, 0)}
                </p>
                <p className="text-[10px] text-[#A9ADBB]">across listed products</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#20232B]/90 p-3">
                <p className="text-[10px] font-bold uppercase text-[#A9ADBB]">Products</p>
                <p className="mt-1 font-heading text-2xl font-extrabold">{data.byItem.length}</p>
                <p className="text-[10px] text-[#A9ADBB]">in this recap</p>
              </div>
            </div>
            {data.topBuyers.length > 0 ? (
              <section
                aria-label="Top buyers"
                className="rounded-xl border border-white/10 bg-[#11141B]/85 p-3 sm:p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#A9ADBB]">
                    Top buyers
                  </h3>
                  <span className="text-[10px] font-semibold uppercase text-[#737B8A]">Top 5</span>
                </div>
                <ol className="space-y-1">
                  {data.topBuyers.slice(0, 5).map((buyer, index) => (
                    <li key={buyer.userId} className="flex min-w-0 items-center gap-2 py-0.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#F5B942]/12 text-xs font-extrabold text-[#F5B942]">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#F7F4EF]">
                        {buyer.username}
                      </span>
                      <span className="shrink-0 text-[10px] text-[#A9ADBB]">
                        {buyer.count} checkout{buyer.count === 1 ? "" : "s"}
                      </span>
                      <span className="w-16 shrink-0 text-right text-[11px] font-bold text-[#56D6AE]">
                        {toCurrency(buyer.volume)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </aside>

          <section className="min-w-0 rounded-xl border border-white/15 bg-[#12151C]/90 p-3 sm:p-4">
            <div className="mb-3 flex items-end justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#9298A8]">The leaderboard</p>
                <h2 className="font-heading text-xl font-extrabold sm:text-2xl">Top products</h2>
              </div>
              <p className="text-right text-[10px] font-semibold uppercase text-[#9298A8]">By dollars spent</p>
            </div>
          {topItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#9298A8]">No successful checkouts in this range.</p>
          ) : (
            <div className="space-y-2">
              {topItems.map((row, index) => {
                const accent = ["#F5B942", "#A8B0C4", "#E78C52", "#56D6AE"][index];
                const width = Math.max(7, (Number(row.volume) / maxItemVolume) * 100);
                return (
                  <article
                    key={row.item}
                    className="overflow-hidden rounded-lg border bg-[#20232B]/85 p-3 sm:p-4"
                    style={{ borderColor: `${accent}55` }}
                  >
                    <div className="flex items-start gap-3">
                      {row.imageUrl ? (
                        <Image
                          src={row.imageUrl}
                          alt=""
                          aria-hidden="true"
                          width={64}
                          height={64}
                          unoptimized
                          className="h-14 w-14 shrink-0 rounded-md border border-white/10 bg-white object-contain"
                        />
                      ) : null}
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-black"
                        style={{ color: accent, borderColor: `${accent}66`, backgroundColor: `${accent}12` }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-snug text-[#F7F4EF] sm:text-base">{row.item}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase">
                          <span className="rounded-full bg-[#F5B942]/15 px-2 py-1 text-[#F5B942]">{row.count} units</span>
                          <span className="rounded-full bg-[#8C93FF]/15 px-2 py-1 text-[#AEB3FF]">
                            {perUnitLabel(row.volume, row.pricedCount)}
                          </span>
                          <span className="rounded-full bg-[#56D6AE]/10 px-2 py-1 text-[#56D6AE]">
                            {toCurrency(row.volume)} volume
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: accent }} />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
            {data.byItem.length > topItems.length ? (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
                <span className="font-bold uppercase tracking-wide text-[#9298A8]">Additional products</span>
                <span className="font-bold text-[#F5B942]">+{data.byItem.length - topItems.length}</span>
              </div>
            ) : null}
          </section>
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-3">
          <a
            href="https://discord.gg/dpcqGawDY4"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#11141B]/80 p-2 transition hover:border-[#56D6AE]/60"
          >
            <Image
              src="/images/chudaco-discord-qr.png"
              alt="QR code to join the ChudACO Discord server"
              width={76}
              height={76}
              unoptimized
              className="h-[76px] w-[76px] rounded-md bg-white object-contain"
            />
            <span>
              <span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#F7F4EF]">
                Scan to join ChudACO
              </span>
              <span className="mt-1 block text-[10px] text-[#A9ADBB]">discord.gg/dpcqGawDY4</span>
            </span>
          </a>
          <span className="pb-1 text-right text-[10px] text-[#9298A8]">
            {data.reconciliation.configured && data.reconciliation.unpricedGapCount > 0
              ? `${data.reconciliation.unpricedGapCount} Discord success(es) are unpriced`
              : "Drop performance snapshot"}
          </span>
        </div>
      </div>
    </div>
  );
}
