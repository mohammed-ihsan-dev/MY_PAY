import { AppError } from "@/lib/errors";
import { db } from "./db";
import { entryView, markReversed, type LedgerEntryView } from "./ledger";
import { reversePayment } from "./debts";
import { undoReceived } from "./cycles";

/**
 * Reverses any ledger entry from the History page, keeping linked records
 * consistent: a debt repayment also reverses the repayment (the debt goes back
 * up) and a salary credit also un-marks that month as received.
 */
export async function reverseEntry(id: string, reason: string): Promise<LedgerEntryView> {
  const entry = await db().ledger.get(id);
  if (!entry) throw AppError.notFound("Transaction not found.");
  if (entry.status !== "active") throw AppError.conflict("This transaction was already reversed.");
  if (entry.kind === "debt_repayment" && entry.debtId && entry.debtPaymentId) {
    await reversePayment(entry.debtId, entry.debtPaymentId, reason || "Reversed from history");
  } else if (entry.kind === "salary" && entry.salaryCycleKey) {
    await undoReceived(entry.salaryCycleKey, reason || "Reversed from history");
  } else {
    await db().transaction("rw", db().ledger, () => markReversed(id, reason || "Reversed"));
  }
  return entryView((await db().ledger.get(id))!);
}
