"use client";

import { IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";

/** Large currency input for the monthly basic salary (₹, number, non-negative). */
export function SalaryInput({ id = "calc-salary", value, onChange, error }: { id?: string; value: string; onChange: (v: string) => void; error?: string | null }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(38,53,45,0.04)] transition-shadow focus-within:border-ring focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--ring)_15%,transparent)] sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
          <IndianRupee className="size-4" />
        </span>
        <label htmlFor={id} className="text-sm font-semibold">
          Monthly Basic Salary
        </label>
      </div>
      <div className={cn("mt-3 flex items-center gap-2 rounded-xl border bg-background/60 px-3 transition-colors", error ? "border-danger" : "border-input")}>
        <span className="text-2xl font-semibold text-muted-foreground" aria-hidden>
          ₹
        </span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="17000"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
          className="tabular h-14 w-full min-w-0 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <p id={`${id}-help`} className={cn("mt-2 text-xs", error ? "font-medium text-danger" : "text-muted-foreground")}>
        {error ?? "Your fixed monthly salary in INR, before overtime."}
      </p>
    </div>
  );
}
