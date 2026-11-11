import { rupeesToPaise } from "@/lib/money";
import type { Direction, LedgerKind, LedgerStatus } from "@/lib/types";
import { entryInputSchema, type EntryInput } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { db, newId, nowIso, type LedgerRecord } from "./db";
import { today } from "./settings";

// The money ledger. Available balance = Σ active IN − Σ active OUT over ALL
// time. It is never reset when a new month starts, so unspent money carries
// forward. Entries are never deleted: a mistake is reversed and stays in history.

export interface LedgerEntryView {
  id: string;
  direction: Direction;
  kind: LedgerKind;
  category: string;
  amountPaise: number;
  date: string;
  description: string;
  status: LedgerStatus;
  reversalReason: string;
  salaryCycleKey: string | null;
  debtId: string | null;
  correctionOf: string | null;
  createdAt: string;
}

export const entryView = (e: LedgerRecord): LedgerEntryView => ({
  id: e.id,
  direction: e.direction,
  kind: e.kind,
  category: e.category,
  amountPaise: e.amountPaise,
  date: e.date,
  description: e.description,
  status: e.status,
  reversalReason: e.reversalReason,
  salaryCycleKey: e.salaryCycleKey,
  debtId: e.debtId,
  correctionOf: e.correctionOf,
  createdAt: e.createdAt,
});

export function assertNotFuture(date: string, todayDate: string, what = "Date") {
  if (date > todayDate) throw AppError.badRequest(`${what} cannot be in the future.`);
}

// ── Balances ─────────────────────────────────────────────────────────────────

export interface Totals {
  inPaise: number;
  outPaise: number;
  balancePaise: number;
}

function sum(entries: LedgerRecord[]): Totals {
  let inPaise = 0;
  let outPaise = 0;
  for (const e of entries) {
    if (e.status !== "active") continue;
    if (e.direction === "in") inPaise += e.amountPaise;
    else outPaise += e.amountPaise;
  }
  return { inPaise, outPaise, balancePaise: inPaise - outPaise };
}

/** Available balance right now: everything received minus everything spent or repaid. */
export async function availableBalance(): Promise<Totals> {
  return sum(await db().ledger.where("status").equals("active").toArray());
}

export interface PeriodSummary {
  from: string;
  to: string; // exclusive
  openingBalancePaise: number;
  salaryReceivedPaise: number;
  otherIncomePaise: number;
  expensesPaise: number;
  debtRepaymentsPaise: number;
  totalInPaise: number;
  totalOutPaise: number;
  closingBalancePaise: number;
  expensesByCategory: { category: string; amountPaise: number }[];
}

/** Money in and out during [from, to), plus the balance carried in and out. */
export async function periodSummary(from: string, to: string): Promise<PeriodSummary> {
  const active = await db().ledger.where("status").equals("active").toArray();
  const before = active.filter((e) => e.date < from);
  const inside = active.filter((e) => e.date >= from && e.date < to);
  const k = (kind: LedgerKind) => inside.filter((e) => e.kind === kind).reduce((s, e) => s + e.amountPaise, 0);
  const byCat = new Map<string, number>();
  for (const e of inside) if (e.kind === "expense") byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountPaise);
  const opening = sum(before).balancePaise;
  const salaryReceivedPaise = k("salary");
  const otherIncomePaise = k("income") + k("borrowed");
  const expensesPaise = k("expense");
  const debtRepaymentsPaise = k("debt_repayment");
  const totalInPaise = salaryReceivedPaise + otherIncomePaise;
  const totalOutPaise = expensesPaise + debtRepaymentsPaise;
  return {
    from,
    to,
    openingBalancePaise: opening,
    salaryReceivedPaise,
    otherIncomePaise,
    expensesPaise,
    debtRepaymentsPaise,
    totalInPaise,
    totalOutPaise,
    closingBalancePaise: opening + totalInPaise - totalOutPaise,
    expensesByCategory: [...byCat].map(([category, amountPaise]) => ({ category, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise),
  };
}

// ── Listing ──────────────────────────────────────────────────────────────────

export interface LedgerFilter {
  from?: string;
  to?: string; // inclusive
  direction?: Direction;
  category?: string;
  showReversed?: boolean;
  limit?: number;
}

export async function listEntries(f: LedgerFilter = {}): Promise<LedgerEntryView[]> {
  const all = await db().ledger.orderBy("date").reverse().toArray();
  const out = all
    .filter((e) => (f.showReversed ? true : e.status === "active"))
    .filter((e) => !f.direction || e.direction === f.direction)
    .filter((e) => !f.category || e.category === f.category)
    .filter((e) => (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to))
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
  return out.slice(0, Math.min(f.limit ?? 500, 5000)).map(entryView);
}

// ── Writing (call inside a db().transaction when part of a larger change) ────

export type NewEntry = Pick<LedgerRecord, "direction" | "kind" | "category" | "amountPaise" | "date"> &
  Partial<Pick<LedgerRecord, "description" | "salaryCycleKey" | "debtId" | "debtPaymentId" | "correctionOf" | "sourceKey">>;

/**
 * Inserts an entry. With a sourceKey, a second insert for the same key returns
 * the existing active entry instead of creating a duplicate.
 */
export async function insertEntry(fields: NewEntry): Promise<{ entry: LedgerRecord; created: boolean }> {
  if (!Number.isInteger(fields.amountPaise) || fields.amountPaise <= 0) throw AppError.badRequest("Amount must be greater than zero.");
  if (fields.sourceKey) {
    const existing = await db().ledger.where("sourceKey").equals(fields.sourceKey).first();
    if (existing) return { entry: existing, created: false };
  }
  const entry: LedgerRecord = {
    id: newId(),
    description: "",
    salaryCycleKey: null,
    debtId: null,
    debtPaymentId: null,
    correctionOf: null,
    reversedSourceKey: null,
    status: "active",
    reversedAt: null,
    reversalReason: "",
    createdAt: nowIso(),
    ...fields,
  };
  if (!entry.sourceKey) delete entry.sourceKey;
  await db().ledger.add(entry);
  return { entry, created: true };
}

/** Marks an entry reversed (kept for the audit trail; no longer counted). */
export async function markReversed(id: string, reason: string): Promise<boolean> {
  const e = await db().ledger.get(id);
  if (!e || e.status !== "active") return false;
  const { sourceKey, ...rest } = e;
  await db().ledger.put({ ...rest, status: "reversed", reversedAt: nowIso(), reversalReason: reason.slice(0, 200), reversedSourceKey: sourceKey ?? null });
  return true;
}

function manualFields(input: EntryInput): NewEntry {
  const income = input.type === "income";
  return {
    direction: income ? "in" : "out",
    kind: income ? "income" : "expense",
    category: input.category,
    amountPaise: rupeesToPaise(input.amount),
    date: input.date,
    description: input.description,
  };
}

/** Records an income or expense typed in by the user. */
export async function addManualEntry(raw: unknown): Promise<{ entry: LedgerEntryView; created: boolean }> {
  const input = entryInputSchema.parse(raw);
  assertNotFuture(input.date, await today());
  const { entry, created } = await db().transaction("rw", db().ledger, () =>
    insertEntry({ ...manualFields(input), sourceKey: input.requestId ? `req:${input.requestId}` : undefined })
  );
  return { entry: entryView(entry), created };
}

/**
 * Corrects an income/expense: the original is kept as "reversed (corrected)"
 * and a new entry with the right values is written, in one transaction.
 */
export async function correctManualEntry(id: string, raw: unknown): Promise<LedgerEntryView> {
  const input = entryInputSchema.parse(raw);
  assertNotFuture(input.date, await today());
  return db().transaction("rw", db().ledger, async () => {
    const original = await db().ledger.get(id);
    if (!original) throw AppError.notFound("Transaction not found.");
    if (original.kind !== "income" && original.kind !== "expense") {
      throw AppError.badRequest("Only incomes and expenses can be edited here. Salary and debt repayments are changed from their own pages.");
    }
    if (original.status !== "active") throw AppError.conflict("This transaction was already reversed.");
    await markReversed(id, "Corrected");
    const { entry } = await insertEntry({ ...manualFields(input), correctionOf: id });
    return entryView(entry);
  });
}
