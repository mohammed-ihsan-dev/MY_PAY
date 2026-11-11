"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, HandCoins, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Segmented } from "@/components/shared/segmented";
import { StatTile } from "@/components/shared/stat-tile";
import { errorMessage } from "@/lib/errors";
import { deleteDebt, reversePayment } from "@/data/debts";
import { formatINR } from "@/lib/money";
import { formatDateKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { DebtOverview, DebtPaymentView, DebtView } from "@/data/debts";
import { DebtDialog, PaymentDialog } from "./debt-dialogs";

type Filter = "active" | "paid" | "all";

export function DebtsView({ debts, overview, balancePaise, today }: { debts: DebtView[]; overview: DebtOverview; balancePaise: number; today: string }) {
  const [filter, setFilter] = useState<Filter>("active");
  const [adding, setAdding] = useState(0);
  const [editing, setEditing] = useState<DebtView | null>(null);
  const [paying, setPaying] = useState<DebtView | null>(null);
  const [deleting, setDeleting] = useState<DebtView | null>(null);
  const [reversing, setReversing] = useState<{ debt: DebtView; payment: DebtPaymentView } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const shown = debts.filter((d) => filter === "all" || d.status === filter);
  const afterDebt = balancePaise - overview.totalOutstandingPaise;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Debt Manager</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Money you owe, and every repayment.</p>
        </div>
        <Button onClick={() => setAdding((n) => n + 1)} className="shrink-0">
          <Plus /> Add debt
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatTile label="Total outstanding debt" value={formatINR(overview.totalOutstandingPaise)} tone={overview.totalOutstandingPaise ? "negative" : "default"} hint={`${overview.activeCount} active`} />
        <StatTile label="Total repaid" value={formatINR(overview.totalRepaidPaise)} tone="positive" />
        <StatTile label="Current available balance" value={formatINR(balancePaise)} />
        <StatTile label="Balance after clearing all debt" value={formatINR(afterDebt)} tone={afterDebt < 0 ? "negative" : "default"} hint="Projection only" className="border-primary/30 bg-accent/60" />
      </div>

      <Segmented
        label="Show"
        value={filter}
        onChange={setFilter}
        className="sm:max-w-sm"
        options={[
          { value: "active", label: `Active (${overview.activeCount})` },
          { value: "paid", label: `Paid (${overview.paidCount})` },
          { value: "all", label: "All" },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={filter === "paid" ? "No fully repaid debts yet" : debts.length ? "No active debts" : "No debts recorded"}
          description={debts.length ? undefined : "Add money you owe to someone, then record repayments as you make them."}
          action={!debts.length && <Button onClick={() => setAdding((n) => n + 1)}><Plus /> Add debt</Button>}
          className="bg-card"
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((d) => {
            const pct = d.originalAmountPaise ? Math.round((d.repaidPaise / d.originalAmountPaise) * 100) : 0;
            const expanded = open[d.id];
            return (
              <li key={d.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{d.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.lender} · borrowed {formatDateKey(d.borrowedOn)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {d.status === "paid" ? <Badge variant="success"><CheckCircle2 /> Paid</Badge> : <Badge variant="warning">Active</Badge>}
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(d)} aria-label={`Edit ${d.name}`} className="ml-1 text-muted-foreground">
                      <Pencil />
                    </Button>
                    {d.payments.length === 0 && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(d)} aria-label={`Delete ${d.name}`} className="text-danger">
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="tabular text-2xl font-semibold tracking-tight">{formatINR(d.remainingPaise)}</p>
                  </div>
                  <p className="tabular pb-1 text-right text-xs text-muted-foreground">
                    {formatINR(d.repaidPaise)} of {formatINR(d.originalAmountPaise)} repaid
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Repaid">
                  <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
                </div>
                {d.notes && <p className="mt-2 text-xs text-muted-foreground">{d.notes}</p>}

                <div className="mt-4 flex gap-2">
                  {d.status === "active" && (
                    <Button className="flex-1" onClick={() => setPaying(d)}>
                      <HandCoins /> Record payment
                    </Button>
                  )}
                  <Button variant="outline" className={cn(d.status !== "active" && "flex-1")} onClick={() => setOpen({ ...open, [d.id]: !expanded })} aria-expanded={expanded}>
                    History ({d.payments.length}) <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
                  </Button>
                </div>

                {expanded && (
                  <div className="mt-3 border-t pt-3">
                    {d.payments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No repayments yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {d.payments.map((p) => (
                          <li key={p.id} className={cn("flex items-center gap-3 text-sm", p.status === "reversed" && "opacity-55")}>
                            <div className="min-w-0 flex-1">
                              <p className={cn("tabular font-medium", p.status === "reversed" && "line-through")}>{formatINR(p.amountPaise)}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {formatDateKey(p.paymentDate)}
                                {p.notes && ` · ${p.notes}`}
                                {p.status === "reversed" && ` · Reversed${p.reversalReason ? `: ${p.reversalReason}` : ""}`}
                              </p>
                            </div>
                            {p.status === "paid" && (
                              <Button variant="ghost" size="sm" onClick={() => setReversing({ debt: d, payment: p })}>
                                <Undo2 /> Reverse
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding > 0 && <DebtDialog key={`add-${adding}`} open onOpenChange={(o) => !o && setAdding(0)} today={today} />}
      {editing && <DebtDialog key={`edit-${editing.id}`} open onOpenChange={(o) => !o && setEditing(null)} debt={editing} today={today} />}
      {paying && <PaymentDialog key={`pay-${paying.id}`} open onOpenChange={(o) => !o && setPaying(null)} debt={paying} balancePaise={balancePaise} today={today} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "debt"}?`}
        description="Only debts without any repayments can be deleted. If you added the borrowed money to your balance, that entry is reversed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await deleteDebt(deleting!.id);
            toast.success("Debt deleted");
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(reversing)}
        onOpenChange={(o) => !o && setReversing(null)}
        title="Reverse this repayment?"
        description={reversing ? `${formatINR(reversing.payment.amountPaise)} goes back onto ${reversing.debt.name} and back into your balance. The payment stays in the history, marked as reversed.` : ""}
        confirmLabel="Reverse payment"
        destructive
        onConfirm={async () => {
          try {
            await reversePayment(reversing!.debt.id, reversing!.payment.id, "Recorded by mistake");
            toast.success("Repayment reversed");
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </div>
  );
}
