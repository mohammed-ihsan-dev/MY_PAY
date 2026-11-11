"use client";

import { cn } from "@/lib/utils";

/** Large ₹ amount input with a numeric keypad on phones. */
export function MoneyInput({ id, value, onChange, invalid, placeholder = "0.00", autoFocus }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border bg-card px-3 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25", invalid ? "border-danger" : "border-input")}>
      <span className="text-xl font-semibold text-muted-foreground" aria-hidden>
        ₹
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        aria-invalid={invalid}
        className="tabular h-13 w-full min-w-0 bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
