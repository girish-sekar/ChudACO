"use client";

import { signIn } from "next-auth/react";

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
      className="w-full rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
    >
      Continue with Discord
    </button>
  );
}
