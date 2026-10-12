"use client";

import Image from "next/image";
import { Copy } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { resolveDropSummaryOrderPrice, type DropSummaryPricingRule } from "@/lib/drop-summary-pricing";
import { toCurrency, type Checkout } from "@/lib/dashboard";

type BackgroundStyle = "profile" | "day" | "night";

const backgrounds: Array<{ key: BackgroundStyle; label: string }> = [
  { key: "profile", label: "ChudACO" },
  { key: "day", label: "Day" },
  { key: "night", label: "Night" },
];

function quantityOf(label: string): number {
  const match = label.match(/\d+/);
  const quantity = match ? Number.parseInt(match[0], 10) : 1;
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

function itemKey(item: string): string {
  return item
    .replace(/^\[([\s\S]+)\]\(https?:\/\/[^)]+\)$/i, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/\s+-\s+\$[0-9][0-9,]*(?:\.[0-9]{2})?\s*$/, "")
    .trim();
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function UserCheckoutSummary({
  checkouts,
  username,
  avatarUrl,
  pricingRules,
}: {
  checkouts: Checkout[];
  username: string;
  avatarUrl: string | null;
  pricingRules: DropSummaryPricingRule[];
}) {
  const recapRef = useRef<HTMLDivElement>(null);
  const [background, setBackground] = useState<BackgroundStyle>("profile");
  const [busy, setBusy] = useState<"copy" | "download" | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const summary = useMemo(() => {
    const success = checkouts.filter((checkout) => checkout.status === "success");
    const failed = checkouts.filter((checkout) => checkout.status === "failed");
    const pending = checkouts.filter((checkout) => checkout.status === "pending");
    const products = new Map<string, { units: number; volume: number; pricedUnits: number; imageUrl: string | null }>();
    const retailerCounts = new Map<string, number>();
    let totalSpend = 0;
    let pricedCheckouts = 0;
    let units = 0;

    for (const checkout of success) {
      const quantity = quantityOf(checkout.qtyLabel);
      const reportedPrice = Number(checkout.price);
      const resolvedPrice = reportedPrice > 0
        ? reportedPrice
        : resolveDropSummaryOrderPrice(checkout.item, checkout.retailer, quantity, pricingRules);
      const key = itemKey(checkout.item);
      const product = products.get(key) ?? { units: 0, volume: 0, pricedUnits: 0, imageUrl: checkout.imageUrl ?? null };
      if (!product.imageUrl && checkout.imageUrl) product.imageUrl = checkout.imageUrl;
      product.units += quantity;
      units += quantity;

      if (resolvedPrice !== null && resolvedPrice > 0) {
        totalSpend += resolvedPrice;
        pricedCheckouts += 1;
        product.volume += resolvedPrice;
        product.pricedUnits += quantity;
      }

      products.set(key, product);
      retailerCounts.set(checkout.retailer, (retailerCounts.get(checkout.retailer) ?? 0) + 1);
    }

    const topProducts = Array.from(products.entries())
      .map(([item, stats]) => ({ item, ...stats }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 4);
    const attempts = success.length + failed.length;
    const start = checkouts.length
      ? checkouts.reduce((oldest, checkout) => checkout.occurredAt < oldest ? checkout.occurredAt : oldest, checkouts[0].occurredAt)
      : new Date().toISOString();
    const end = checkouts.length
      ? checkouts.reduce((newest, checkout) => checkout.occurredAt > newest ? checkout.occurredAt : newest, checkouts[0].occurredAt)
      : new Date().toISOString();

    return {
      successCount: success.length,
      failedCount: failed.length,
      pendingCount: pending.length,
      attempts,
      successRate: attempts > 0 ? Math.round((success.length / attempts) * 100) : 0,
      totalSpend,
      pricedCheckouts,
      units,
      productCount: products.size,
      retailerCount: retailerCounts.size,
      topRetailer: Array.from(retailerCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No retailer data",
      topProducts,
      additionalProducts: Math.max(0, products.size - topProducts.length),
      hasUnpricedSuccess: success.length > pricedCheckouts,
      start,
      end,
    };
  }, [checkouts, pricingRules]);

  async function createPng(): Promise<Blob> {
    const node = recapRef.current;
    if (!node) throw new Error("Recap is not ready yet.");
    const { toBlob } = await import("html-to-image");
    if (document.fonts?.ready) await document.fonts.ready;
    const options = {
      pixelRatio: 2,
      backgroundColor: "#101116",
      width: node.scrollWidth,
      height: node.scrollHeight,
    };
    await toBlob(node, options);
    const blob = await toBlob(node, options);
    if (!blob) throw new Error("Could not render the recap image.");
    return blob;
  }

  async function copyImage() {
    setBusy("copy");
    setMessage(null);
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image clipboard is not supported by this browser.");
      }
      const blob = await createPng();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setMessage({ text: "Recap image copied", error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not copy image.", error: true });
    } finally {
      setBusy(null);
    }
  }

  async function downloadImage() {
    setBusy("download");
    setMessage(null);
    try {
      const blob = await createPng();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `chudaco-my-recap-${summary.end.slice(0, 10)}-${background}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not download image.", error: true });
    } finally {
      setBusy(null);
    }
  }

  const recapBackground = background === "day"
    ? "linear-gradient(rgba(9,13,25,.5),rgba(9,13,25,.72)),url('/images/drop-recap-day.png')"
    : background === "night"
      ? "linear-gradient(rgba(8,10,26,.36),rgba(8,10,26,.64)),url('/images/drop-recap-night.png')"
      : "radial-gradient(ellipse at 12% 8%,rgba(36,92,158,.24),transparent 42%),radial-gradient(ellipse at 4% 88%,rgba(157,47,58,.2),transparent 38%),linear-gradient(115deg,#11141b,#18151a)";
  const spendScale = Math.max(1, ...summary.topProducts.map((product) => product.volume));
  const hasUnknownPrices = summary.hasUnpricedSuccess;
  const rangeLabel = summary.start.slice(0, 10) === summary.end.slice(0, 10)
    ? dateLabel(summary.end)
    : `${dateLabel(summary.start)} – ${dateLabel(summary.end)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#9C9AAE]">Background</span>
          <div className="inline-flex rounded-md border border-[#393B46] bg-[#11141B] p-1" role="group" aria-label="Recap background">
            {backgrounds.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={background === option.key}
                onClick={() => setBackground(option.key)}
                className={`rounded px-3 py-1.5 text-xs font-semibold ${background === option.key ? "bg-[#F04438] text-white" : "text-[#A9ADBB] hover:text-white"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void copyImage()} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-md border border-[#F04438]/40 bg-[#17191F] px-3 py-2 text-sm font-semibold text-[#F7F4EF] disabled:opacity-50">
            <Copy size={15} aria-hidden="true" />{busy === "copy" ? "Copying..." : "Copy image"}
          </button>
          <button type="button" onClick={() => void downloadImage()} disabled={busy !== null} className="rounded-md border border-[#F04438]/40 bg-[#17191F] px-3 py-2 text-sm font-semibold text-[#F7F4EF] disabled:opacity-50">
            {busy === "download" ? "Generating..." : "Download image"}
          </button>
        </div>
      </div>
      {message ? <p role="status" className={`text-right text-xs ${message.error ? "text-[#FF716A]" : "text-[#65DCB1]"}`}>{message.text}</p> : null}

      <section
        ref={recapRef}
        className="relative isolate overflow-hidden rounded-2xl border border-white/15 p-4 text-[#F5F3F0] shadow-xl sm:p-5"
        style={{ backgroundImage: recapBackground, backgroundPosition: "center", backgroundSize: "cover" }}
      >
        {background === "profile" ? (
          <Image src="/images/setup-guide-header.png" alt="" aria-hidden="true" width={240} height={180} unoptimized className="pointer-events-none absolute -left-16 -top-14 -z-10 h-56 w-64 scale-125 object-cover opacity-[0.11] blur-3xl" />
        ) : null}
        <div className="absolute inset-x-0 top-0 -z-0 h-1 bg-gradient-to-r from-[#F04438] via-[#F3BD48] to-[#65DCB1]" />

        <header className="relative z-10 flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image src="/images/setup-guide-header.png" alt="ChudACO" width={44} height={44} unoptimized className="h-10 w-10 shrink-0 rounded-full border border-[#F04438]/60 object-cover" />
            <div className="min-w-0">
              <p className="font-heading text-xl font-black leading-none">MY <span className="text-[#F3BD48]">CHUDACO</span></p>
              <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[.15em] text-[#A8A9B4]">Personal checkout recap</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-extrabold">{rangeLabel}</p>
            <div className="mt-1 flex items-center justify-end gap-1.5">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  aria-hidden="true"
                  width={28}
                  height={28}
                  unoptimized
                  className="h-7 w-7 shrink-0 rounded-full border border-white/20 object-cover"
                />
              ) : (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-[10px] font-bold text-[#D9D9DE]">
                  {username.slice(0, 1).toUpperCase()}
                </span>
              )}
              <p className="max-w-40 truncate text-xs font-semibold text-[#D9D9DE]">{username}</p>
            </div>
          </div>
        </header>

        <div className="relative z-10 mt-3 grid items-stretch gap-3 lg:grid-cols-[.62fr_1fr]">
          <aside className="grid min-w-0 gap-2.5 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)]">
            <div className="rounded-xl border border-[#F04438]/50 bg-[#2d181c]/90 px-3 py-2.5">
              <p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-[#FF938B]">Top retailer</p>
              <p className="mt-0.5 font-heading text-lg font-extrabold">{summary.topRetailer}</p>
            </div>
            <div className="flex min-h-0 flex-col rounded-xl border border-[#F3BD48]/40 bg-[#1e1d1c]/95 p-3">
              <p className="text-[9px] font-extrabold uppercase tracking-[.13em] text-[#F3BD48]">Your checkout summary</p>
              <p className="mt-1 font-heading text-5xl font-black leading-none text-[#F3BD48]">{summary.successCount}</p>
              <div className="mt-2 flex justify-between gap-2 text-[10px] text-[#A8A9B4]">
                <span>successful checkouts</span><span>{summary.attempts} attempts</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#65DCB1]" style={{ width: `${summary.successRate}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between gap-2 text-[10px] text-[#A8A9B4]">
                <span>{summary.failedCount} failed{summary.pendingCount ? ` · ${summary.pendingCount} queued` : ""}</span>
                <span>{summary.successRate}% success</span>
              </div>
              <div className="mt-3 grid flex-1 grid-cols-3 grid-rows-2 gap-1.5 border-t border-white/10 pt-2.5">
                <StatTile value={String(summary.units)} label="Units" />
                <StatTile value={String(summary.productCount)} label="Products" />
                <StatTile value={toCurrency(summary.totalSpend)} label={hasUnknownPrices ? "Known spend" : "Spent"} />
                <StatTile value={summary.pricedCheckouts ? toCurrency(summary.totalSpend / summary.pricedCheckouts) : "—"} label="Avg. order" />
                <StatTile value={String(summary.retailerCount)} label="Retailers" />
                <StatTile value={String(summary.successCount)} label="Checkouts" />
              </div>
            </div>
          </aside>

          <section className="min-w-0 rounded-xl border border-white/15 bg-[#11131b]/95 p-3">
            <div className="flex items-end justify-between gap-2 border-b border-white/10 pb-2">
              <div><p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-[#A8A9B4]">Your haul</p><h2 className="mt-0.5 font-heading text-lg font-extrabold">Top products</h2></div>
              <span className="text-right text-[8px] font-extrabold uppercase tracking-[.1em] text-[#A8A9B4]">By dollars spent</span>
            </div>
            {summary.topProducts.length ? (
              <div className="mt-2 grid gap-1.5">
                {summary.topProducts.map((product, index) => {
                  const priceEach = product.pricedUnits ? product.volume / product.pricedUnits : null;
                  return (
                    <article key={product.item} className="rounded-lg border border-white/10 bg-[#242630]/85 p-2.5">
                      <div className="flex items-start gap-2">
                        {product.imageUrl ? (
                          <Image
                            src={product.imageUrl}
                            alt=""
                            aria-hidden="true"
                            width={56}
                            height={56}
                            unoptimized
                            className="h-14 w-14 shrink-0 rounded-md border border-white/10 bg-white object-contain"
                          />
                        ) : null}
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#F3BD48]/45 text-[9px] font-black text-[#F3BD48]">{String(index + 1).padStart(2, "0")}</span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[11px] font-bold leading-snug">{product.item}</h3>
                          <div className="mt-1.5 flex flex-wrap gap-1 text-[8px] font-extrabold uppercase">
                            <span className="rounded-full bg-[#F3BD48]/15 px-1.5 py-1 text-[#F3BD48]">{product.units} units</span>
                            <span className="rounded-full bg-[#A9B5FF]/15 px-1.5 py-1 text-[#C2CAFF]">{priceEach === null ? "Price unknown" : `${toCurrency(priceEach)} ea`}</span>
                            {product.pricedUnits > 0 ? <span className="rounded-full bg-[#65DCB1]/10 px-1.5 py-1 text-[#65DCB1]">{toCurrency(product.volume)} spent</span> : null}
                          </div>
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#F3BD48]" style={{ width: `${Math.max(7, (product.volume / spendScale) * 100)}%` }} /></div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="py-8 text-center text-xs text-[#A8A9B4]">Your successful products will appear here.</p>}
            {summary.additionalProducts ? <div className="mt-2 flex justify-between rounded-lg bg-white/[.045] px-2.5 py-2 text-[9px] font-extrabold uppercase text-[#A8A9B4]"><span>Additional products</span><span className="text-[#F3BD48]">+{summary.additionalProducts}</span></div> : null}
          </section>
        </div>

        <footer className="relative z-10 mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-white/10 pt-2.5">
          <a href="https://discord.gg/dpcqGawDY4" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#101116]/85 p-1.5">
            <Image src="/images/chudaco-discord-qr.png" alt="QR code to join the ChudACO Discord server" width={58} height={58} unoptimized className="h-[58px] w-[58px] rounded bg-white" />
            <span><span className="block text-[8px] font-black uppercase tracking-[.12em]">Scan to join ChudACO</span><span className="mt-1 block text-[8px] text-[#A8A9B4]">discord.gg/dpcqGawDY4</span></span>
          </a>
          <p className="text-right text-[8px] text-[#747887]">{hasUnknownPrices ? "Some successful orders have unknown prices" : "Your private checkout summary"}</p>
        </footer>
      </section>
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-center rounded-md border border-white/[.07] bg-[#242630]/85 px-2 py-2">
      <p className="truncate text-sm font-black leading-tight">{value}</p>
      <p className="mt-1 truncate text-[7px] font-extrabold uppercase tracking-[.08em] text-[#A8A9B4]">{label}</p>
    </div>
  );
}