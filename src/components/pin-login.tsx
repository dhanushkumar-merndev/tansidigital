"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Delete, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useTransition } from "react";
import { useWebHaptics } from "web-haptics/react";

const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["delete", "0", "submit"],
] as const;

const PIN_LOGIN_ROUNDED_CLASS = "rounded-[28px]";
const PIN_HEAVY_HAPTIC_PRESET = "heavy";

type PinLoginProps = {
  length?: number;
  title?: string;
};

type KeypadValue = (typeof KEYPAD_ROWS)[number][number];

export function PinLogin({ length = 6, title = "Enter Dashboard PIN" }: PinLoginProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { trigger } = useWebHaptics();
  const [pin, setPin] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submitPin() {
    if (pin.length !== length || isSubmitting) {
      await trigger(PIN_HEAVY_HAPTIC_PRESET);
      return;
    }

    setIsSubmitting(true);
    setError("");
    await trigger(PIN_HEAVY_HAPTIC_PRESET);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pin }),
    });

    if (!response.ok) {
      setPin("");
      setIsSubmitting(false);
      setError("Wrong PIN. Try again.");
      await trigger(PIN_HEAVY_HAPTIC_PRESET);
      return;
    }

    await trigger(PIN_HEAVY_HAPTIC_PRESET);
    await trigger(PIN_HEAVY_HAPTIC_PRESET); // Double tap feeling for success
    startTransition(() => {
      router.refresh();
    });
  }

  async function handlePress(value: KeypadValue) {
    if (isSubmitting || !value) return;

    if (value === "delete") {
      if (pin.length === 0) {
        return;
      }

      setPin((current) => current.slice(0, -1));
      await trigger(PIN_HEAVY_HAPTIC_PRESET);
      return;
    }

    if (value === "submit") {
      await submitPin();
      return;
    }

    if (pin.length >= length) {
      return;
    }

    setError("");

    setPin((current) => {
      return `${current}${value}`;
    });

    await trigger(PIN_HEAVY_HAPTIC_PRESET);
    
  }

  return (
    <div className="relative isolate h-dvh overflow-hidden bg-[#0D4D8B] transition-[background-color] duration-500 ease-out">
      <motion.div
        className="crm-gpu-animated absolute -left-10 top-24 h-40 w-40 rounded-full bg-white/10 blur-3xl"
        animate={{ y: [0, 22, 0] }}
        transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        className="crm-gpu-animated absolute -right-8 bottom-10 h-48 w-48 rounded-full bg-[#ff8f99]/18 blur-3xl"
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />

      <div className="crm-touch-scroll relative z-10 flex h-full items-center justify-center overflow-y-auto px-5 py-4 sm:px-6 sm:py-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className={`crm-gpu-layer ${PIN_LOGIN_ROUNDED_CLASS} flex w-full max-w-[380px] flex-col justify-center border border-white/12 bg-white/6 px-4 py-5 text-white backdrop-blur-xl sm:px-5 sm:py-6`}
        >
          <div className="mb-8 text-center">
            <div className={`${PIN_LOGIN_ROUNDED_CLASS} mb-3 inline-flex h-12 w-12 items-center justify-center border border-white/16 bg-white/14`}>
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-[0.01em]">{title}</h1>
            <p className="mt-2 text-sm text-white/68">
              Secure access for the Bigwing and Redwing analytics board.
            </p>
          </div>

          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait">
              {isSubmitting || isPending ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12"
                >
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className={`${PIN_LOGIN_ROUNDED_CLASS} mb-6 flex h-16 w-16 items-center justify-center border border-white/20 bg-white/10`}
                  >
                    <LockKeyhole className="h-8 w-8 text-white" />
                  </motion.div>
                  <h2 className="text-xl font-medium text-white">
                    {isPending ? "Syncing Workbook..." : "Verifying PIN..."}
                  </h2>
                  <p className="mt-2 text-sm text-white/52">
                    {isPending ? "Preparing your dashboard experience" : "Checking access credentials"}
                  </p>
                  
                  <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      animate={{
                        x: ["-100%", "100%"],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="h-full w-full bg-gradient-to-r from-transparent via-white/40 to-transparent"
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="keypad"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className={`${PIN_LOGIN_ROUNDED_CLASS} mb-8 border border-white/12 bg-white/8 px-5 py-6`}>
                    <div className="mb-3 flex items-center justify-center gap-4">
                      {Array.from({ length }).map((_, index) => {
                        const filled = index < pin.length;

                        return (
                          <motion.div
                            key={index}
                            layout
                            className={`h-4 w-4 rounded-full border border-white/85 ${
                              filled ? "bg-white shadow-[0_0_24px_rgba(255,255,255,0.6)]" : "bg-transparent"
                            }`}
                          />
                        );
                      })}
                    </div>

                    <div className="text-center text-xs uppercase tracking-[0.28em] text-white/46">
                      {pin.length}/{length} digits
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {KEYPAD_ROWS.flatMap((row, rowIndex) =>
                      row.map((key, columnIndex) => {
                        const cellKey = `keypad-${rowIndex}-${columnIndex}-${key || "empty"}`;

                        if (!key) {
                          return <div key={cellKey} className="h-[76px] w-full" />;
                        }

                        const isDelete = key === "delete";
                        const isSubmit = key === "submit";

                        return (
                          <motion.button
                            whileTap={{ scale: 0.94 }}
                            key={cellKey}
                            type="button"
                            onClick={() => handlePress(key)}
                            className={`${PIN_LOGIN_ROUNDED_CLASS} flex h-[76px] w-full items-center justify-center border border-white/14 bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-xl transition hover:bg-white/18`}
                            aria-label={
                              isDelete ? "Delete digit" : isSubmit ? "Submit PIN" : `Enter ${key}`
                            }
                          >
                            {isDelete ? (
                              <Delete className="h-6 w-6" />
                            ) : isSubmit ? (
                              <ChevronRight className="h-7 w-7" />
                            ) : (
                              <span className="text-2xl font-medium">{key}</span>
                            )}
                          </motion.button>
                        );
                      }),
                    )}
                  </div>

                  <AnimatePresence mode="wait">
                    {error ? (
                      <motion.p
                        key={error}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="mt-4 text-center text-sm text-[#ffd3d3]"
                      >
                        {error}
                      </motion.p>
                    ) : (
                      <motion.p
                        key="hint"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="mt-4 text-center text-sm text-white/54"
                      >
                        Tap digits, then press enter.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
