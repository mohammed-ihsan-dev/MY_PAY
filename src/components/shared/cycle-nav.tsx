import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCyclePeriod, formatPayDate, shiftCycle, type SalaryCycle } from "@/lib/salary-cycle";
import { cn } from "@/lib/utils";

/** "OCTOBER 2026 SALARY · 01 OCT 2026 – 31 OCT 2026 · paid 10 NOV 2026" with previous / next links. */
export function CycleNav({ cycle, currentKey, basePath, className }: { cycle: SalaryCycle; currentKey: string; basePath: string; className?: string }) {
  const prev = shiftCycle(cycle.key, -1);
  const next = shiftCycle(cycle.key, 1);
  const canNext = next <= currentKey;
  const href = (key: string) => (key === currentKey ? basePath : `${basePath}?cycle=${key}`);
  const btn = "grid size-10 shrink-0 place-items-center rounded-xl border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link href={href(prev)} className={btn} aria-label="Previous salary cycle" scroll={false}>
        <ChevronLeft className="size-4" />
      </Link>
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-[13px] font-semibold uppercase tracking-wide">
          {cycle.label} salary
          {cycle.key === currentKey && <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 align-middle text-[10px] font-semibold normal-case tracking-normal text-accent-foreground">Current</span>}
        </p>
        <p className="tabular mt-0.5 text-xs text-muted-foreground">{formatCyclePeriod(cycle)}</p>
        <p className="tabular text-[11px] text-muted-foreground">Paid on {formatPayDate(cycle)}</p>
      </div>
      {canNext ? (
        <Link href={href(next)} className={btn} aria-label="Next salary cycle" scroll={false}>
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={cn(btn, "pointer-events-none opacity-35")} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}
