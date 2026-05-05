"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

type AccessBlockedProps = {
  state?: "blocked" | "pending";
};

export function AccessBlocked({ state = "blocked" }: AccessBlockedProps) {
  const isPending = state === "pending";
  const router = useRouter();

  React.useEffect(() => {
    if (!isPending) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPending, router]);

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#0D4D8B] px-5 py-8 text-white">
      <div className="absolute -left-10 top-24 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -right-8 bottom-10 h-48 w-48 rounded-full bg-[#ff8f99]/18 blur-3xl" />

      <div className="relative z-10 w-full max-w-xl rounded-[32px] border border-white/12 bg-white/8 p-6 text-center shadow-[0_40px_120px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/18 bg-white/14">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          {isPending ? "Access pending" : "Access blocked"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-white/70 sm:text-base">
          {isPending
            ? "This browser has been registered, but approval is still pending."
            : "This browser has been marked as blocked in the sheet access list."}
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/14 bg-white px-6 text-sm font-medium text-[#0D4D8B] transition hover:bg-white/92"
          >
            Return to login
          </Link>
        </div>
      </div>
    </div>
  );
}
