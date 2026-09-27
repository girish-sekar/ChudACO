"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { toCurrency, type DropSummaryResponse } from "@/lib/dashboard";

function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function perUnitLabel(volume: string, count: number): string {
  const price = count > 0 ? Number(volume) / count : 0;
  return `~${toCurrency(price.toFixed(2))} ea`;
}

export default function ExecutiveSummary({ data }: { data: DropSummaryResponse }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const topItems = data.byItem.slice(0, 4);

  async function handleDownload() {
    const node = cardRef.current;
    if (!node) return;
    setDownloading(true);
    setDownloadError(null);
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
      link.download = `chudaco-drop-summary-${data.range.from.slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setDownloadError("Failed to generate image.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="rounded-md bg-[#2F5BFF] px-4 py-2 text-sm font-medium text-white hover:bg-[#274CE0] disabled:opacity-50"
        >
          {downloading ? "Generating..." : "Download as image"}
        </button>
      </div>
      {downloadError ? <p className="text-right text-sm text-[#FF5D5D]">{downloadError}</p> : null}

      <div
        ref={cardRef}
        className="mx-auto w-full max-w-3xl rounded-2xl border border-[#2C2D3A] bg-[#0B0B10] p-8 text-[#F2F1F6]"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/images/setup-guide-header.png"
              alt="ChudACO"
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 rounded-md object-cover"
            />
            <div>
              <p className="font-heading text-lg font-bold tracking-tight">
                CHUDACO <span className="text-[#9C9AAE]">· DROP STATS</span>
              </p>
              <p className="text-xs text-[#605E72]">Post-drop analytics &amp; community performance</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-[#9C9AAE]">Reporting window</p>
            <p className="font-heading text-sm font-bold">
              {formatDayLabel(data.range.from)} — {formatDayLabel(data.range.to)}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">Successful checkouts</p>
            <p className="mt-2 font-heading text-2xl font-bold text-[#4ADE80]">
              {data.totals.successfulCheckouts}
            </p>
          </div>
          <div className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">Total spent</p>
            <p className="mt-2 font-heading text-2xl font-bold">{toCurrency(data.totals.totalDollarVolume)}</p>
          </div>
          <div className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">Members</p>
            <p className="mt-2 font-heading text-2xl font-bold">{data.totals.uniqueBuyers}</p>
          </div>
          <div className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <p className="text-xs text-[#605E72]">Retailers hit</p>
            <p className="mt-2 font-heading text-2xl font-bold">{data.totals.uniqueRetailers}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#605E72]">Top items</p>
          {topItems.length === 0 ? (
            <p className="text-sm text-[#605E72]">No successful checkouts in this range.</p>
          ) : (
            <div className="space-y-2">
              {topItems.map((row, index) => (
                <div
                  key={row.item}
                  className="flex items-center gap-3 rounded-xl border border-[#2C2D3A] bg-[#18181F] p-3"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#101014] text-xs font-bold text-[#9C9AAE]">
                    {index + 1}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{row.item}</p>
                  <div className="shrink-0 text-right">
                    <p className="font-heading text-sm font-bold text-[#FFCB3C]">x{row.count}</p>
                    <p className="text-xs text-[#605E72]">{perUnitLabel(row.volume, row.count)}</p>
                  </div>
                  <p className="w-20 shrink-0 text-right font-heading text-sm font-bold text-[#4ADE80]">
                    {toCurrency(row.volume)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 border-t border-[#2C2D3A] pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[#605E72]">Avg. order value</p>
            <p className="mt-1 font-heading text-lg font-bold">{toCurrency(data.totals.averageOrderValue)}</p>
          </div>
          <div>
            <p className="text-xs text-[#605E72]">Generated</p>
            <p className="mt-1 font-heading text-lg font-bold">{formatDayLabel(new Date().toISOString())}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
