"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { Segmented } from "@/components/shared/segmented";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { addManualEntry, correctManualEntry } from "@/data/ledger";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/types";
import { newRequestId } from "@/lib/request-id";
import { cn } from "@/lib/utils";

export type EntryType = "expense" | "income";

export interface EntryDraft {
  id?: string; // editing an existing entry (a correction)
  type: EntryType;
  amount: string;
  category: string;
  date: string;
  description: string;
}

export function blankEntry(type: EntryType, today: string): EntryDraft {
  return { type, amount: "", category: type === "expense" ? "food" : "freelance", date: today, description: "" };
}

/** Add (or correct) an expense or an income. Bottom sheet on phones. */
export function EntryDialog({ open, onOpenChange, initial, today }: { open: boolean; onOpenChange: (o: boolean) => void; initial: EntryDraft; today: string }) {
  const [form, setForm] = useState(initial);
  const [requestId, setRequestId] = useState(newRequestId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const editing = Boolean(initial.id);
  const categories = form.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const setType = (type: EntryType) => setForm((f) => ({ ...f, type, category: type === "expense" ? "food" : "freelance" }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = { type: form.type, category: form.category, amount: form.amount, date: form.date, description: form.description, ...(editing ? {} : { requestId }) };
    try {
      if (editing) await correctManualEntry(initial.id!, body);
      else await addManualEntry(body);
      toast.success(editing ? "Transaction corrected" : form.type === "expense" ? "Expense saved" : "Income saved");
      setRequestId(newRequestId());
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
          <DialogTitle>{editing ? "Correct transaction" : form.type === "expense" ? "Add expense" : "Add income"}</DialogTitle>
          <DialogDescription>{editing ? "The original stays in your history, marked as corrected." : "Saved to your balance straight away."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {!editing && (
            <Segmented
              label="Type"
              value={form.type}
              onChange={setType}
              options={[
                { value: "expense", label: "Expense (out)" },
                { value: "income", label: "Income (in)" },
              ]}
            />
          )}
          <Field label="Amount" htmlFor="entry-amount" error={errors.amount}>
            <MoneyInput id="entry-amount" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} invalid={Boolean(errors.amount)} autoFocus={!editing} />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{form.type === "expense" ? "Category" : "Source"}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categories.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={form.category === c.value}
                  onClick={() => setForm({ ...form, category: c.value })}
                  className={cn(
                    "h-11 rounded-xl border px-3 text-left text-sm font-medium transition",
                    form.category === c.value ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-muted"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {errors.category && <p className="mt-1 text-xs font-medium text-danger">{errors.category}</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="entry-date" error={errors.date}>
              <Input id="entry-date" type="date" max={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="entry-desc" error={errors.description}>
              <Input id="entry-desc" placeholder={form.type === "expense" ? "e.g. Lunch" : "e.g. Website project"} maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {editing ? "Save correction" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
