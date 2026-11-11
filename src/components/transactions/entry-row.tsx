import { ArrowDownLeft, ArrowUpRight, Banknote, HandCoins } from "lucide-react";
import { formatINR } from "@/lib/money";
import { formatDateKey } from "@/lib/dates";
import { categoryLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { LedgerEntryView } from "@/data/ledger";

/** One ledger line with a clear IN / OUT indicator. */
export function EntryRow({ entry, showDate = true }: { entry: LedgerEntryView; showDate?: boolean }) {
  const isIn = entry.direction === "in";
  const reversed = entry.status === "reversed";
  const Icon = entry.kind === "salary" ? Banknote : entry.kind === "debt_repayment" ? HandCoins : isIn ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className={cn("flex min-w-0 items-center gap-3", reversed && "opacity-55")}>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", isIn ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", reversed && "line-through")}>{entry.description || categoryLabel(entry.category)}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className={cn("mr-1.5 font-semibold", isIn ? "text-success" : "text-danger")}>{isIn ? "IN" : "OUT"}</span>
          {categoryLabel(entry.category)}
          {showDate && ` · ${formatDateKey(entry.date, "dd MMM")}`}
          {reversed && ` · ${entry.reversalReason === "Corrected" ? "Corrected" : "Reversed"}`}
          {entry.correctionOf && !reversed && " · Edited"}
        </p>
      </div>
      <p className={cn("tabular shrink-0 text-sm font-semibold", isIn ? "text-success" : "text-foreground", reversed && "line-through")}>
        {isIn ? "+" : "−"}
        {formatINR(entry.amountPaise)}
      </p>
    </div>
  );
}
