"use client";

import { Clock, Minus, Plus } from "lucide-react";
import { describeDuration, formatHMM, type OvertimeDuration, type ParseResult } from "@/lib/salary-calculator";
import { cn } from "@/lib/utils";

const STEP = 15;

/**
 * Total monthly overtime in H.MM (or H:MM) form — the part after the separator
 * is MINUTES: "3.21" = 3 hours 21 minutes. Shows the normalized interpretation live.
 */
export function OvertimeDurationInput({
  id = "calc-overtime",
  value,
  onChange,
  parsed,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  parsed: ParseResult<OvertimeDuration>;
}) {
  const current = parsed.ok ? parsed.value.totalMinutes : null;
  const step = (delta: number) => onChange(formatHMM(Math.max(0, (current ?? 0) + delta)));

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(38,53,45,0.04)] transition-shadow focus-within:border-ring focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--ring)_15%,transparent)] sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Clock className="size-4" />
        </span>
        <label htmlFor={id} className="text-sm font-semibold">
          Total Overtime Duration
        </label>
      </div>
      <div className={cn("mt-3 flex items-center gap-2 rounded-xl border bg-background/60 pl-3 pr-1.5 transition-colors", parsed.ok ? "border-input" : "border-danger")}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!parsed.ok}
          aria-describedby={`${id}-help ${id}-reading`}
          className="tabular h-14 w-full min-w-0 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
        />
        <span className="hidden text-xs font-medium text-muted-foreground sm:block">h.mm</span>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => step(-STEP)}
            disabled={!current}
            className="grid size-11 place-items-center rounded-lg border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40"
            aria-label="Decrease by 15 minutes"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => step(STEP)}
            disabled={current === null}
            className="grid size-11 place-items-center rounded-lg border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40"
            aria-label="Increase by 15 minutes"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>
      <p id={`${id}-help`} className="mt-2 text-xs text-muted-foreground">
        Enter hours and minutes. Example: <span className="font-semibold text-foreground">3.21</span> = 3 hours 21 minutes (3:21 also works).
      </p>
      <div id={`${id}-reading`} aria-live="polite" className="mt-2.5">
        {parsed.ok ? (
          <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground">
            <span>{describeDuration(parsed.value.totalMinutes)}</span>
            <span className="opacity-60">·</span>
            <span className="tabular">{parsed.value.totalMinutes} min</span>
            {value.trim() === "" && <span className="opacity-70">(empty = no overtime)</span>}
          </p>
        ) : (
          <p role="alert" className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs font-medium text-danger">
            {parsed.error}
          </p>
        )}
      </div>
    </div>
  );
}
