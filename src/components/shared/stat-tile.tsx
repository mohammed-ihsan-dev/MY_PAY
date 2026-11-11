import { cn } from "@/lib/utils";

export function StatTile({ label, value, hint, tone = "default", className }: { label: string; value: string; hint?: React.ReactNode; tone?: "default" | "positive" | "negative" | "muted"; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border bg-card p-3.5 sm:p-4", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular mt-1 truncate text-lg font-semibold tracking-tight sm:text-xl",
          tone === "positive" && "text-success",
          tone === "negative" && "text-danger",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
