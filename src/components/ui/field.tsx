"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function Field({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function FieldLabel({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-semibold uppercase tracking-[0.24em] text-white/65", className)}
      {...props}
    />
  );
}
