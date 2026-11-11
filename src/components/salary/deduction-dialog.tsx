"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { addDeduction, updateDeduction, type DeductionItem } from "@/data/cycles";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { formatINR, paiseToRupees, rupeesToPaise } from "@/lib/money";
import { DEDUCTION_CATEGORIES } from "@/lib/types";

/** Add or edit one salary deduction (fine). Shows the effect on the final salary as you type. */
export function DeductionDialog({
  cycleKey,
  item,
  grossPaise,
  otherDeductionsPaise,
  today,
  onClose,
}: {
  cycleKey: string;
  item?: DeductionItem;
  grossPaise: number;
  otherDeductionsPaise: number;
  today: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    category: item?.category ?? "late_fine",
    amount: item ? String(paiseToRupees(item.amountPaise)) : "",
    description: item?.description ?? "",
    deductionDate: item?.deductionDate ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  let amountPaise = 0;
  try {
    amountPaise = form.amount && Number(form.amount) > 0 ? rupeesToPaise(form.amount) : 0;
  } catch {
    amountPaise = 0;
  }
  const after = grossPaise - otherDeductionsPaise - amountPaise;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      if (item) await updateDeduction(cycleKey, item.id, form);
      else await addDeduction(cycleKey, form);
      toast.success(item ? "Deduction updated" : "Deduction added");
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit deduction" : "Add deduction"}</DialogTitle>
          <DialogDescription>Taken off this month&rsquo;s salary before it is paid.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Deduction category" htmlFor="ded-cat" error={errors.category}>
            <Select id="ded-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {DEDUCTION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deduction amount" htmlFor="ded-amount" error={errors.amount}>
            <MoneyInput id="ded-amount" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} invalid={Boolean(errors.amount) || after < 0} autoFocus={!item} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reason (optional)" htmlFor="ded-desc" error={errors.description}>
              <Input id="ded-desc" maxLength={200} placeholder="e.g. 3 late days" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Date (optional)" htmlFor="ded-date" error={errors.deductionDate}>
              <Input id="ded-date" type="date" max={today} value={form.deductionDate} onChange={(e) => setForm({ ...form, deductionDate: e.target.value })} />
            </Field>
          </div>
          <div className={`flex items-center justify-between rounded-xl p-3 text-sm ${after < 0 ? "bg-danger-soft text-danger" : "bg-muted"}`}>
            <span>{after < 0 ? "More than the gross salary" : "Final salary after this"}</span>
            <span className="tabular font-semibold">{formatINR(after)}</span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy || amountPaise <= 0 || after < 0}>
              {busy && <Loader2 className="animate-spin" />} {item ? "Save deduction" : "Add deduction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
