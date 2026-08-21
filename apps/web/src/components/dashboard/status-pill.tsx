import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import type { CheckoutStatus } from "@/lib/dashboard";

type StatusPillProps = {
  status: CheckoutStatus;
};

export function StatusPill({ status }: StatusPillProps) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#4ADE80]/40 px-2 py-1 text-xs text-[#4ADE80]">
        <CheckCircle2 className="h-3.5 w-3.5" /> Success
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#FF5D5D]/40 px-2 py-1 text-xs text-[#FF5D5D]">
        <XCircle className="h-3.5 w-3.5" /> Failed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#FFCB3C]/40 px-2 py-1 text-xs text-[#FFCB3C]">
      <Clock3 className="h-3.5 w-3.5" /> In queue
    </span>
  );
}