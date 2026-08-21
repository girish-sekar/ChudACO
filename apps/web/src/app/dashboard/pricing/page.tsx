"use client";

import useSWR from "swr";
import { fetchJson, toCurrency, type PricingRule } from "@/lib/dashboard";

type PricingResponse = {
  data: PricingRule[];
};

export default function PricingPage() {
  const { data, error } = useSWR<PricingResponse>("/api/pricing", fetchJson);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold">Pricing</h1>
        <p className="mt-1 text-sm text-[#9C9AAE]">Fee schedule applied to successful checkouts only.</p>
      </header>

      {error ? <p className="text-sm text-[#FF5D5D]">Failed to load pricing rules.</p> : null}
      {!data ? <p className="text-sm text-[#9C9AAE]">Loading pricing...</p> : null}

      {data ? (
        <section className="overflow-hidden rounded-xl border border-[#2C2D3A] bg-[#18181F]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#2C2D3A] text-[#9C9AAE]">
                <th className="px-4 py-3 font-medium">Product type</th>
                <th className="px-4 py-3 font-medium">Retail range</th>
                <th className="px-4 py-3 font-medium">Fee</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((rule) => (
                <tr key={rule.id} className="border-b border-[#2C2D3A]/70 last:border-0">
                  <td className="px-4 py-3 text-[#F2F1F6]">{rule.category}</td>
                  <td className="px-4 py-3 text-[#9C9AAE]">{rule.priceRangeLabel}</td>
                  <td className="px-4 py-3 text-[#F2F1F6]">
                    {rule.feeType === "flat" && rule.feeFlat ? toCurrency(rule.feeFlat) : `${rule.feePercent}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-[#2C2D3A] px-4 py-3 text-xs text-[#605E72]">
            Fees are only charged on successful checkouts after confirmation.
          </p>
        </section>
      ) : null}
    </div>
  );
}