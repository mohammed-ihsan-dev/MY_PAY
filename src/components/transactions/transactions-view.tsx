"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeftRight, Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Segmented } from "@/components/shared/segmented";
import { StatTile } from "@/components/shared/stat-tile";
import { errorMessage } from "@/lib/errors";
import { reverseEntry } from "@/data/reverse";
import { formatINR, paiseToRupees } from "@/lib/money";
import { formatDateKey } from "@/lib/dates";
import { categoryLabel, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/types";
import type { LedgerEntryView } from "@/data/ledger";
import { EntryDialog, type EntryDraft } from "./entry-dialog";
import { EntryRow } from "./entry-row";
import { QuickAdd } from "./quick-add";

export interface TxFilters {
  period: "cycle" | "last" | "all" | "custom";
  from: string;
  to: string;
  dir: "all" | "in" | "out";
  cat: string;
  rev: boolean;
}

const KIND_LABEL: Record<LedgerEntryView["kind"], string> = {
  salary: "Salary",
  income: "Income",
  expense: "Expense",
  debt_repayment: "Debt repayment",
  borrowed: "Borrowed money",
};

export function TransactionsView({ entries, filters, today }: { entries: LedgerEntryView[]; filters: TxFilters; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<LedgerEntryView | null>(null);
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [reversing, setReversing] = useState<LedgerEntryView | null>(null);

  const go = (patch: Partial<TxFilters>) => {
    const f = { ...filters, ...patch };
    const p = new URLSearchParams();
    if (f.period !== "cycle") p.set("period", f.period);
    if (f.period === "custom") {
      if (f.from) p.set("from", f.from);
      if (f.to) p.set("to", f.to);
    }
    if (f.dir !== "all") p.set("dir", f.dir);
    if (f.cat) p.set("cat", f.cat);
    if (f.rev) p.set("rev", "1");
    router.replace(p.size ? `${pathname}?${p}` : pathname, { scroll: false });
  };

  const active = entries.filter((e) => e.status === "active");
  const totalIn = active.filter((e) => e.direction === "in").reduce((s, e) => s + e.amountPaise, 0);
  const totalOut = active.filter((e) => e.direction === "out").reduce((s, e) => s + e.amountPaise, 0);

  const groups: { date: string; items: LedgerEntryView[] }[] = [];
  for (const e of entries) {
    const g = groups.at(-1);
    if (g && g.date === e.date) g.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }

  const categoryOptions = filters.dir === "in" ? [...INCOME_CATEGORIES, { value: "salary", label: "Salary" }, { value: "borrowed", label: "Borrowed money" }] : filters.dir === "out" ? [...EXPENSE_CATEGORIES, { value: "debt_repayment", label: "Debt repayment" }] : [{ value: "salary", label: "Salary" }, ...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, { value: "debt_repayment", label: "Debt repayment" }];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">History</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Every rupee in and out. Nothing is ever deleted.</p>
      </div>

      <QuickAdd today={today} compact className="sm:max-w-sm" />

      <div className="space-y-3 rounded-2xl border bg-card p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select aria-label="Period" value={filters.period} onChange={(e) => go({ period: e.target.value as TxFilters["period"] })}>
            <option value="cycle">This month</option>
            <option value="last">Last month</option>
            <option value="all">All time</option>
            <option value="custom">Custom dates</option>
          </Select>
          <Select aria-label="Category" value={filters.cat} onChange={(e) => go({ cat: e.target.value })}>
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        {filters.period === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" aria-label="From" value={filters.from} max={today} onChange={(e) => go({ from: e.target.value })} />
            <Input type="date" aria-label="To" value={filters.to} max={today} onChange={(e) => go({ to: e.target.value })} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Direction"
            value={filters.dir}
            onChange={(dir) => go({ dir, cat: "" })}
            className="min-w-0 flex-1 sm:max-w-xs"
            options={[
              { value: "all", label: "All" },
              { value: "in", label: "IN" },
              { value: "out", label: "OUT" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={filters.rev} onCheckedChange={(rev: boolean) => go({ rev })} aria-label="Show reversed transactions" />
            Show reversed
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label="Money in" value={formatINR(totalIn)} tone="positive" />
        <StatTile label="Money out" value={formatINR(totalOut)} tone="negative" />
        <StatTile label="Net" value={formatINR(totalIn - totalOut)} />
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="No transactions here" description="Try another period or filter, or add an expense or income." className="bg-card" />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.date} className="rounded-2xl border bg-card">
              <h2 className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">{formatDateKey(g.date, "EEEE, dd MMM yyyy")}</h2>
              <ul className="divide-y">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <button className="w-full px-4 py-3 text-left transition hover:bg-muted/60" onClick={() => setSelected(e)}>
                      <EntryRow entry={e} showDate={false} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {entries.length >= 500 && <p className="text-center text-xs text-muted-foreground">Showing the latest 500. Narrow the dates to see older ones.</p>}
        </div>
      )}

      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selected.description || categoryLabel(selected.category)}</DialogTitle>
              <DialogDescription>
                {KIND_LABEL[selected.kind]} · {formatDateKey(selected.date)}
              </DialogDescription>
            </DialogHeader>
            <p className={`tabular text-3xl font-semibold ${selected.direction === "in" ? "text-success" : ""}`}>
              {selected.direction === "in" ? "+" : "−"}
              {formatINR(selected.amountPaise)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={selected.direction === "in" ? "success" : "danger"}>{selected.direction === "in" ? "Money IN" : "Money OUT"}</Badge>
              <Badge>{categoryLabel(selected.category)}</Badge>
              {selected.status === "reversed" && <Badge variant="warning">{selected.reversalReason === "Corrected" ? "Corrected (replaced)" : `Reversed${selected.reversalReason ? `: ${selected.reversalReason}` : ""}`}</Badge>}
              {selected.correctionOf && <Badge variant="info">Corrected entry</Badge>}
            </div>
            {selected.kind === "debt_repayment" && selected.status === "active" && <p className="mt-3 text-xs text-muted-foreground">Reversing a repayment also puts the amount back on the debt.</p>}
            {selected.kind === "salary" && selected.status === "active" && <p className="mt-3 text-xs text-muted-foreground">Reversing the salary credit also marks that salary cycle as not received.</p>}
            {selected.status === "active" && (
              <DialogFooter>
                {(selected.kind === "income" || selected.kind === "expense") && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setEditing({ id: selected.id, type: selected.kind as "income" | "expense", amount: String(paiseToRupees(selected.amountPaise)), category: selected.category, date: selected.date, description: selected.description });
                      setSelected(null);
                    }}
                  >
                    <Pencil /> Correct
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => {
                    setReversing(selected);
                    setSelected(null);
                  }}
                >
                  <Undo2 /> Reverse
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      )}

      {editing && <EntryDialog key={editing.id} open onOpenChange={(o) => !o && setEditing(null)} initial={editing} today={today} />}

      <ConfirmDialog
        open={Boolean(reversing)}
        onOpenChange={(o) => !o && setReversing(null)}
        title="Reverse this transaction?"
        description="It will no longer count towards your balance. It stays in your history, marked as reversed."
        confirmLabel="Reverse"
        destructive
        onConfirm={async () => {
          try {
            await reverseEntry(reversing!.id, "");
            toast.success("Transaction reversed");
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </div>
  );
}
