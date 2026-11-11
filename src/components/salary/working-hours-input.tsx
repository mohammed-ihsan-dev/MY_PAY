"use client";

import { Timer } from "lucide-react";

/** Total working time for the cycle as separate hours and minutes fields (e.g. 175 h 30 min). */
export function WorkingHoursInput({ hours, minutes, onChange, error }: { hours: string; minutes: string; onChange: (h: string, m: string) => void; error?: string | null }) {
  const cls = "tabular h-13 w-full min-w-0 rounded-xl border border-input bg-background/60 px-3 pr-14 text-xl font-semibold outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25";
  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Timer className="size-4" />
        </span>
        <span className="text-sm font-semibold">Total Working Hours</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="relative block">
          <span className="sr-only">Hours</span>
          <input inputMode="numeric" placeholder="0" value={hours} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3), minutes)} className={cls} aria-invalid={Boolean(error)} />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">hours</span>
        </label>
        <label className="relative block">
          <span className="sr-only">Minutes</span>
          <input inputMode="numeric" placeholder="0" value={minutes} onChange={(e) => onChange(hours, e.target.value.replace(/\D/g, "").slice(0, 2))} className={cls} aria-invalid={Boolean(error)} />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">min</span>
        </label>
      </div>
      <p className={error ? "mt-2 text-xs font-medium text-danger" : "mt-2 text-xs text-muted-foreground"}>
        {error ?? "For your records only. It does not change the hourly rate (that always uses the daily hours from Settings)."}
      </p>
    </div>
  );
}
