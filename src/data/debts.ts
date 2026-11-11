import { rupeesToPaise } from "@/lib/money";
import type { DebtPaymentStatus, DebtStatus } from "@/lib/types";
import { debtInputSchema, debtPaymentInputSchema, debtUpdateSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { db, newId, nowIso, type DebtRecord, type PaymentRecord } from "./db";
import { assertNotFuture, insertEntry, markReversed } from "./ledger";
import { today } from "./settings";

// Debt Manager. A repayment is written in ONE IndexedDB transaction:
//   1. the payment record (history; never deleted),
//   2. one OUT ledger entry (sourceKey "debtpay:<paymentId>") lowering the balance,
//   3. the debt's remaining amount / status.
// It is never also an ordinary expense, so it is never counted twice.
// "Balance after clearing all debt" (balance − outstanding) is only a projection.

export interface DebtPaymentView {
  id: string;
  amountPaise: number;
  paymentDate: string;
  status: DebtPaymentStatus;
  notes: string;
  reversalReason: string;
}

export interface DebtView {
  id: string;
  name: string;
  lender: string;
  originalAmountPaise: number;
  repaidPaise: number;
  remainingPaise: number;
  status: DebtStatus;
  borrowedOn: string;
  notes: string;
  addedToBalance: boolean;
  payments: DebtPaymentView[];
}

export interface DebtOverview {
  totalOriginalPaise: number;
  totalOutstandingPaise: number;
  totalRepaidPaise: number;
  activeCount: number;
  paidCount: number;
}

const repaidOf = (payments: PaymentRecord[]) => payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountPaise, 0);

export async function listDebts(): Promise<DebtView[]> {
  const [debts, payments, borrowed] = await Promise.all([
    db().debts.toArray(),
    db().payments.toArray(),
    db().ledger.where("kind").equals("borrowed").toArray(),
  ]);
  const withBalance = new Set(borrowed.filter((b) => b.status === "active").map((b) => b.debtId));
  const views = debts
    .sort((a, b) => (a.borrowedOn === b.borrowedOn ? b.createdAt.localeCompare(a.createdAt) : b.borrowedOn.localeCompare(a.borrowedOn)))
    .map((d): DebtView => {
      const list = payments
        .filter((p) => p.debtId === d.id)
        .sort((a, b) => (a.paymentDate === b.paymentDate ? b.createdAt.localeCompare(a.createdAt) : b.paymentDate.localeCompare(a.paymentDate)));
      const repaid = repaidOf(list);
      const remaining = Math.max(0, d.originalAmountPaise - repaid);
      return {
        id: d.id,
        name: d.name,
        lender: d.lender,
        originalAmountPaise: d.originalAmountPaise,
        repaidPaise: repaid,
        remainingPaise: remaining,
        status: remaining === 0 ? "paid" : "active",
        borrowedOn: d.borrowedOn,
        notes: d.notes,
        addedToBalance: withBalance.has(d.id),
        payments: list.map((p) => ({ id: p.id, amountPaise: p.amountPaise, paymentDate: p.paymentDate, status: p.status, notes: p.notes, reversalReason: p.reversalReason })),
      };
    });
  return views.sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));
}

export function summarizeDebts(debts: DebtView[]): DebtOverview {
  return {
    totalOriginalPaise: debts.reduce((s, d) => s + d.originalAmountPaise, 0),
    totalOutstandingPaise: debts.reduce((s, d) => s + d.remainingPaise, 0),
    totalRepaidPaise: debts.reduce((s, d) => s + d.repaidPaise, 0),
    activeCount: debts.filter((d) => d.status === "active").length,
    paidCount: debts.filter((d) => d.status === "paid").length,
  };
}

export async function getDebt(id: string): Promise<DebtView> {
  const found = (await listDebts()).find((d) => d.id === id);
  if (!found) throw AppError.notFound("Debt not found.");
  return found;
}

/** Recomputes a debt's stored remaining amount and status from its repayment history (inside a transaction). */
async function refreshDebt(debtId: string) {
  const debt = await db().debts.get(debtId);
  if (!debt) return;
  const repaid = repaidOf(await db().payments.where("debtId").equals(debtId).toArray());
  const remaining = Math.max(0, debt.originalAmountPaise - repaid);
  await db().debts.put({ ...debt, remainingPaise: remaining, status: remaining === 0 ? "paid" : "active", updatedAt: nowIso() });
}

export async function createDebt(raw: unknown): Promise<DebtView> {
  const input = debtInputSchema.parse(raw);
  assertNotFuture(input.borrowedOn, await today(), "Borrowing date");
  const amount = rupeesToPaise(input.originalAmount);
  const id = newId();
  await db().transaction("rw", db().debts, db().ledger, async () => {
    const at = nowIso();
    await db().debts.add({ id, name: input.name, lender: input.lender, originalAmountPaise: amount, remainingPaise: amount, status: "active", borrowedOn: input.borrowedOn, notes: input.notes, createdAt: at, updatedAt: at });
    if (input.addToBalance) {
      await insertEntry({ direction: "in", kind: "borrowed", category: "borrowed", amountPaise: amount, date: input.borrowedOn, description: `Borrowed · ${input.name} (${input.lender})`, debtId: id, sourceKey: `debt:${id}` });
    }
  });
  return getDebt(id);
}

export async function updateDebt(id: string, raw: unknown): Promise<DebtView> {
  const patch = debtUpdateSchema.parse(raw);
  if (patch.borrowedOn) assertNotFuture(patch.borrowedOn, await today(), "Borrowing date");
  await db().transaction("rw", db().debts, db().payments, async () => {
    const debt = await db().debts.get(id);
    if (!debt) throw AppError.notFound("Debt not found.");
    const next: DebtRecord = { ...debt, updatedAt: nowIso() };
    if (patch.originalAmount !== undefined) {
      const amount = rupeesToPaise(patch.originalAmount);
      if (amount < repaidOf(await db().payments.where("debtId").equals(id).toArray())) {
        throw AppError.badRequest("The original amount cannot be less than what you have already repaid.", "originalAmount");
      }
      next.originalAmountPaise = amount;
    }
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.lender !== undefined) next.lender = patch.lender;
    if (patch.borrowedOn !== undefined) next.borrowedOn = patch.borrowedOn;
    if (patch.notes !== undefined) next.notes = patch.notes;
    await db().debts.put(next);
    await refreshDebt(id);
  });
  return getDebt(id);
}

/** Deletes a debt entered by mistake. Only allowed while it has no repayment history. */
export async function deleteDebt(id: string) {
  await db().transaction("rw", db().debts, db().payments, db().ledger, async () => {
    if (!(await db().debts.get(id))) throw AppError.notFound("Debt not found.");
    if ((await db().payments.where("debtId").equals(id).count()) > 0) {
      throw AppError.conflict("This debt has repayment history, which is always kept. It cannot be deleted.");
    }
    for (const e of await db().ledger.where("debtId").equals(id).toArray()) {
      if (e.kind === "borrowed") await markReversed(e.id, "Debt deleted");
    }
    await db().debts.delete(id);
  });
}

export async function recordPayment(debtId: string, raw: unknown): Promise<{ debt: DebtView; created: boolean }> {
  const input = debtPaymentInputSchema.parse(raw);
  const todayDate = await today();
  assertNotFuture(input.paymentDate, todayDate, "Payment date");
  const amount = rupeesToPaise(input.amount);

  const created = await db().transaction("rw", db().debts, db().payments, db().ledger, async () => {
    if (input.requestId && (await db().payments.where("requestId").equals(input.requestId).first())) return false; // double submit
    const debt = await db().debts.get(debtId);
    if (!debt) throw AppError.notFound("Debt not found.");
    if (input.paymentDate < debt.borrowedOn) throw AppError.badRequest("Payment date cannot be before the borrowing date.", "paymentDate");
    const remaining = debt.originalAmountPaise - repaidOf(await db().payments.where("debtId").equals(debtId).toArray());
    if (remaining <= 0) throw AppError.conflict("This debt is already fully repaid.");
    if (amount > remaining) throw AppError.badRequest(`That is more than the ₹${(remaining / 100).toFixed(2)} still owed.`, "amount");

    const payment: PaymentRecord = { id: newId(), debtId, amountPaise: amount, paymentDate: input.paymentDate, status: "paid", notes: input.notes, reversedAt: null, reversalReason: "", createdAt: nowIso() };
    if (input.requestId) payment.requestId = input.requestId;
    await db().payments.add(payment);
    await insertEntry({
      direction: "out",
      kind: "debt_repayment",
      category: "debt_repayment",
      amountPaise: amount,
      date: input.paymentDate,
      description: `Repayment · ${debt.name} (${debt.lender})`.slice(0, 200),
      debtId,
      debtPaymentId: payment.id,
      sourceKey: `debtpay:${payment.id}`,
    });
    await refreshDebt(debtId);
    return true;
  });
  return { debt: await getDebt(debtId), created };
}

/** Reverses a repayment recorded by mistake. History is kept; the money returns to the balance. */
export async function reversePayment(debtId: string, paymentId: string, reason: string): Promise<DebtView> {
  await db().transaction("rw", db().debts, db().payments, db().ledger, async () => {
    const payment = await db().payments.get(paymentId);
    if (!payment || payment.debtId !== debtId || payment.status !== "paid") throw AppError.notFound("Payment not found or already reversed.");
    await db().payments.put({ ...payment, status: "reversed", reversedAt: nowIso(), reversalReason: reason || "Reversed" });
    for (const e of await db().ledger.where("debtPaymentId").equals(paymentId).toArray()) {
      if (e.status === "active") await markReversed(e.id, reason || "Repayment reversed");
    }
    await refreshDebt(debtId);
  });
  return getDebt(debtId);
}
