"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { createDebt, recordPayment, updateDebt } from "@/data/debts";
import { formatINR, paiseToRupees, rupeesToPaise } from "@/lib/money";
import { newRequestId } from "@/lib/request-id";
import type { DebtView } from "@/data/debts";

/** Add a new debt, or edit an existing one. */
export function DebtDialog({ open, onOpenChange, debt, today }: { open: boolean; onOpenChange: (o: boolean) => void; debt?: DebtView; today: string }) {
  const [form, setForm] = useState({
    name: debt?.name ?? "",
    lender: debt?.lender ?? "",
    originalAmount: debt ? String(paiseToRupees(debt.originalAmountPaise)) : "",
    borrowedOn: debt?.borrowedOn ?? today,
    notes: debt?.notes ?? "",
    addToBalance: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      if (debt) {
        const { addToBalance: _ignored, ...patch } = form;
        void _ignored;
        await updateDebt(debt.id, patch);
        toast.success("Debt updated");
      } else {
        await createDebt(form);
        toast.success("Debt added");
      }
      onOpenChange(false);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{debt ? "Edit debt" : "Add debt"}</DialogTitle>
          <DialogDescription>Money you owe to someone.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Debt name" htmlFor="debt-name" error={errors.name}>
              <Input id="debt-name" placeholder="e.g. Bike repair loan" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Person or lender" htmlFor="debt-lender" error={errors.lender}>
              <Input id="debt-lender" placeholder="e.g. Friend" maxLength={120} value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
            </Field>
          </div>
          <Field label="Original amount" htmlFor="debt-amount" error={errors.originalAmount}>
            <MoneyInput id="debt-amount" value={form.originalAmount} onChange={(originalAmount) => setForm({ ...form, originalAmount })} invalid={Boolean(errors.originalAmount)} />
          </Field>
          <Field label="Borrowing date" htmlFor="debt-date" error={errors.borrowedOn}>
            <Input id="debt-date" type="date" max={today} value={form.borrowedOn} onChange={(e) => setForm({ ...form, borrowedOn: e.target.value })} />
          </Field>
          <Field label="Notes (optional)" htmlFor="debt-notes" error={errors.notes}>
            <Textarea id="debt-notes" maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {!debt && (
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border bg-muted/50 p-3.5">
              <span className="text-sm">
                <span className="font-medium">I received this money now</span>
                <span className="block text-xs text-muted-foreground">Adds the borrowed amount to your available balance. Leave off if you already spent it or recorded it.</span>
              </span>
              <Switch checked={form.addToBalance} onCheckedChange={(addToBalance: boolean) => setForm({ ...form, addToBalance })} aria-label="Add borrowed money to my balance" />
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {debt ? "Save changes" : "Add debt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Record a partial or full repayment. */
export function PaymentDialog({ open, onOpenChange, debt, balancePaise, today }: { open: boolean; onOpenChange: (o: boolean) => void; debt: DebtView; balancePaise: number; today: string }) {
  const [form, setForm] = useState({ amount: "", paymentDate: today, notes: "" });
  const [requestId] = useState(newRequestId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  let amountPaise = 0;
  try {
    amountPaise = form.amount ? rupeesToPaise(form.amount) : 0;
  } catch {
    amountPaise = 0;
  }
  const tooMuch = amountPaise > debt.remainingPaise;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await recordPayment(debt.id, { ...form, requestId });
      toast.success(amountPaise === debt.remainingPaise ? `${debt.name} is fully repaid` : "Payment recorded");
      onOpenChange(false);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {debt.name} · {debt.lender} · {formatINR(debt.remainingPaise)} left
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Payment amount" htmlFor="pay-amount" error={errors.amount ?? (tooMuch ? `More than the ${formatINR(debt.remainingPaise)} still owed` : undefined)}>
            <MoneyInput id="pay-amount" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} invalid={tooMuch || Boolean(errors.amount)} autoFocus />
          </Field>
          <Button type="button" variant="secondary" className="w-full" onClick={() => setForm({ ...form, amount: String(paiseToRupees(debt.remainingPaise)) })}>
            Pay it all: {formatINR(debt.remainingPaise)}
          </Button>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment date" htmlFor="pay-date" error={errors.paymentDate}>
              <Input id="pay-date" type="date" min={debt.borrowedOn} max={today} value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
            </Field>
            <Field label="Notes (optional)" htmlFor="pay-notes" error={errors.notes}>
              <Input id="pay-notes" maxLength={500} placeholder="e.g. UPI" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          {amountPaise > 0 && !tooMuch && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Debt left after</p>
                <p className="tabular font-semibold">{formatINR(debt.remainingPaise - amountPaise)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Balance after</p>
                <p className="tabular font-semibold">{formatINR(balancePaise - amountPaise)}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy || tooMuch || amountPaise <= 0}>
              {busy && <Loader2 className="animate-spin" />} Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
