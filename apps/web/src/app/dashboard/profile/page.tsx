"use client";

import { FormEvent, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import useSWR from "swr";
import Image from "next/image";
import { fetchJson, type Profile } from "@/lib/dashboard";

type ProfileResponse = {
  data: Profile;
};

export default function ProfilePage() {
  const { data, error, mutate } = useSWR<ProfileResponse>("/api/profile", fetchJson);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    shippingName: "",
    shippingPhone: "",
    shippingAddr: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    notifyOnSuccess: true,
    notifyOnFailure: true,
    notifyWeeklySummary: false,
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    setForm({
      shippingName: data.data.shippingName ?? "",
      shippingPhone: data.data.shippingPhone ?? "",
      shippingAddr: data.data.shippingAddr ?? "",
      shippingCity: data.data.shippingCity ?? "",
      shippingState: data.data.shippingState ?? "",
      shippingZip: data.data.shippingZip ?? "",
      notifyOnSuccess: data.data.notifyOnSuccess,
      notifyOnFailure: data.data.notifyOnFailure,
      notifyWeeklySummary: data.data.notifyWeeklySummary,
    });
  }, [data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);

    const payload = {
      shippingName: form.shippingName || null,
      shippingPhone: form.shippingPhone || null,
      shippingAddr: form.shippingAddr || null,
      shippingCity: form.shippingCity || null,
      shippingState: form.shippingState || null,
      shippingZip: form.shippingZip || null,
      notifyOnSuccess: form.notifyOnSuccess,
      notifyOnFailure: form.notifyOnFailure,
      notifyWeeklySummary: form.notifyWeeklySummary,
    };

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSaving(false);

    if (!response.ok) {
      setStatus("Failed to save profile.");
      return;
    }

    setStatus("Profile saved.");
    await mutate();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-[#9C9AAE]">Shipping details and alert preferences.</p>
      </header>

      {error ? <p className="text-sm text-[#FF5D5D]">Failed to load profile.</p> : null}
      {!data ? <p className="text-sm text-[#9C9AAE]">Loading profile...</p> : null}

      {data ? (
        <>
          <section className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
            <div className="flex items-center gap-4">
              {data.data.avatarUrl ? (
                <Image
                  src={data.data.avatarUrl}
                  alt={data.data.username}
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-full border border-[#2C2D3A]"
                />
              ) : (
                <div className="h-14 w-14 rounded-full border border-[#2C2D3A] bg-[#101014]" />
              )}
              <div>
                <p className="font-heading text-2xl font-semibold">{data.data.username}</p>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#4ADE80]/40 px-2 py-1 text-xs text-[#4ADE80]">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified role
                </div>
              </div>
            </div>
          </section>

          <form onSubmit={submit} className="grid gap-3 rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4 md:grid-cols-2">
            <input value={form.shippingName} onChange={(e) => setForm((v) => ({ ...v, shippingName: e.target.value }))} placeholder="Shipping name" className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
            <input value={form.shippingPhone} onChange={(e) => setForm((v) => ({ ...v, shippingPhone: e.target.value }))} placeholder="Shipping phone" className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
            <input value={form.shippingAddr} onChange={(e) => setForm((v) => ({ ...v, shippingAddr: e.target.value }))} placeholder="Shipping address" className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2" />
            <input value={form.shippingCity} onChange={(e) => setForm((v) => ({ ...v, shippingCity: e.target.value }))} placeholder="City" className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
            <input value={form.shippingState} onChange={(e) => setForm((v) => ({ ...v, shippingState: e.target.value }))} placeholder="State" className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />
            <input value={form.shippingZip} onChange={(e) => setForm((v) => ({ ...v, shippingZip: e.target.value }))} placeholder="ZIP" className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm" />

            <label className="flex items-center gap-2 text-sm text-[#9C9AAE]">
              <input type="checkbox" checked={form.notifyOnSuccess} onChange={(e) => setForm((v) => ({ ...v, notifyOnSuccess: e.target.checked }))} /> Notify on success
            </label>
            <label className="flex items-center gap-2 text-sm text-[#9C9AAE]">
              <input type="checkbox" checked={form.notifyOnFailure} onChange={(e) => setForm((v) => ({ ...v, notifyOnFailure: e.target.checked }))} /> Notify on failure
            </label>
            <label className="flex items-center gap-2 text-sm text-[#9C9AAE] md:col-span-2">
              <input type="checkbox" checked={form.notifyWeeklySummary} onChange={(e) => setForm((v) => ({ ...v, notifyWeeklySummary: e.target.checked }))} /> Weekly summary
            </label>

            <button type="submit" disabled={isSaving} className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] md:col-span-2">
              {isSaving ? "Saving..." : "Save profile"}
            </button>
          </form>

          {status ? <p className="text-sm text-[#9C9AAE]">{status}</p> : null}
        </>
      ) : null}
    </div>
  );
}