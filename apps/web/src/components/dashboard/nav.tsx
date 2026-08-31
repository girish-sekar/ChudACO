"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/checkouts", label: "Checkouts" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/pricing", label: "Pricing" },
  { href: "/dashboard/accounts", label: "Accounts" },
  { href: "/dashboard/admin", label: "Admin", adminOnly: true },
  { href: "/dashboard/profile", label: "Profile" },
];

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="mt-8 space-y-2">
      {links
        .filter((link) => !link.adminOnly || isAdmin)
        .map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`block rounded-md px-3 py-2 text-sm transition ${
              isActive
                ? "bg-[#2F5BFF] text-[#F2F1F6]"
                : "text-[#9C9AAE] hover:bg-[#18181F] hover:text-[#F2F1F6]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}