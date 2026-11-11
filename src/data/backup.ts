import { z } from "zod";
import { AppError } from "@/lib/errors";
import { db, newId, nowIso, type BackupMetaRecord } from "./db";
import { upgradeCycle } from "./cycle-migrate";

// Backup & restore. Everything lives only on this device, so a JSON backup
// file is the safety net. Files are created and read locally; nothing is
// uploaded anywhere. The PIN is never written into a backup.

export const BACKUP_FORMAT = "my-pay-backup";
export const BACKUP_SCHEMA_VERSION = 2; // 2: salary deductions + status + finalization snapshots
export const BACKUP_REMINDER_DAYS = 7;
const PRIVATE_PREFS = /^pin/; // security preferences stay on the device

// ── Validation schemas ──────────────────────────────────────────────────────

const id = z.string().min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Invalid date" });
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Invalid month" });
const paise = z.number().int({ error: "Amounts must be whole paise" }).min(0).max(10_000_000_000);
const positivePaise = paise.min(1);
const iso = z.string().min(10);

const settingsSchema = z.object({
  id: z.literal("salary"),
  monthlyBasicSalaryPaise: paise,
  salaryDivisor: z.number().int().min(1).max(31),
  standardDailyHours: z.number().min(0.5).max(24),
  overtimeMultiplier: z.number().min(0).max(10),
  paydayDay: z.number().int().min(1).max(28),
  currency: z.literal("INR"),
  timezone: z.string().min(1),
  updatedAt: iso,
});

const deductionSchema = z.object({
  id,
  category: z.string().min(1).max(40),
  description: z.string().max(200),
  amountPaise: positivePaise,
  deductionDate: date.nullable(),
  createdAt: iso,
  updatedAt: iso,
});

const snapshotSchema = z.object({
  finalizedAt: iso,
  basicSalaryPaise: paise,
  salaryDivisor: z.number().min(1),
  standardDailyHours: z.number().min(0.5),
  overtimeMultiplier: z.number().min(0),
  workingMinutes: z.number().int().min(0),
  overtimeInput: z.string(),
  overtimeMinutes: z.number().int().min(0),
  hourlySalaryExact: z.string(),
  overtimeEarningsPaise: paise,
  grossSalaryPaise: paise,
  deductionItems: z.array(deductionSchema),
  totalDeductionsPaise: paise,
  finalSalaryPayablePaise: paise,
  reopenedAt: iso.nullable(),
  reopenReason: z.string(),
});

const cycleSchema = z.object({
  cycleKey: month,
  label: z.string(),
  startDate: date,
  endDate: date,
  payDate: date,
  basicSalaryPaise: paise,
  salaryDivisor: z.number().min(1),
  standardDailyHours: z.number().min(0.5),
  overtimeMultiplier: z.number().min(0),
  workingMinutes: z.number().int().min(0),
  overtimeInput: z.string(),
  overtimeMinutes: z.number().int().min(0),
  dailySalaryExact: z.string(),
  hourlySalaryExact: z.string(),
  dailySalaryPaise: paise,
  hourlySalaryPaise: paise,
  overtimeEarningsPaise: paise,
  totalEarningsPaise: paise,
  calculatorVersion: z.number().int(),
  deductionItems: z.array(deductionSchema),
  totalDeductionsPaise: paise,
  grossSalaryPaise: paise,
  finalSalaryPayablePaise: paise,
  status: z.enum(["draft", "finalized", "received"]),
  finalizedAt: iso.nullable(),
  receivedAt: iso.nullable(),
  receivedLedgerTransactionId: id.nullable(),
  finalizations: z.array(snapshotSchema),
  notes: z.string(),
  received: z.boolean(),
  receivedOn: date.nullable(),
  receivedAmountPaise: paise.nullable(),
  ledgerEntryId: id.nullable(),
  createdAt: iso,
  updatedAt: iso,
});

const debtSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  lender: z.string().min(1).max(120),
  originalAmountPaise: positivePaise,
  remainingPaise: paise,
  status: z.enum(["active", "paid"]),
  borrowedOn: date,
  notes: z.string(),
  createdAt: iso,
  updatedAt: iso,
});

const paymentSchema = z.object({
  id,
  debtId: id,
  amountPaise: positivePaise,
  paymentDate: date,
  status: z.enum(["paid", "reversed"]),
  notes: z.string(),
  requestId: z.string().optional(),
  reversedAt: iso.nullable(),
  reversalReason: z.string(),
  createdAt: iso,
});

const ledgerSchema = z.object({
  id,
  direction: z.enum(["in", "out"]),
  kind: z.enum(["salary", "income", "expense", "debt_repayment", "borrowed"]),
  category: z.string().min(1).max(40),
  amountPaise: positivePaise,
  date,
  description: z.string().max(200),
  salaryCycleKey: month.nullable(),
  debtId: id.nullable(),
  debtPaymentId: id.nullable(),
  sourceKey: z.string().optional(),
  reversedSourceKey: z.string().nullable(),
  status: z.enum(["active", "reversed"]),
  reversedAt: iso.nullable(),
  reversalReason: z.string(),
  correctionOf: id.nullable(),
  createdAt: iso,
});

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT, { error: "This is not a MY PAY backup file." }),
  schemaVersion: z.number().int(),
  backupId: id,
  createdAt: iso,
  app: z.string().optional(),
  source: z.string().optional(),
  data: z.object({
    settings: z.array(settingsSchema).max(1),
    cycles: z.array(cycleSchema),
    debts: z.array(debtSchema),
    payments: z.array(paymentSchema),
    ledger: z.array(ledgerSchema),
    preferences: z.array(z.object({ key: z.string(), value: z.unknown() })),
  }),
});
export type Backup = z.infer<typeof backupSchema>;

// ── Export ───────────────────────────────────────────────────────────────────

async function snapshot(): Promise<Backup> {
  const d = db();
  const [settings, cycles, debts, payments, ledger, preferences] = await Promise.all([
    d.settings.toArray(),
    d.cycles.toArray(),
    d.debts.toArray(),
    d.payments.toArray(),
    d.ledger.toArray(),
    d.preferences.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupId: newId(),
    createdAt: nowIso(),
    app: "MY PAY",
    source: "device",
    data: { settings, cycles, debts, payments, ledger, preferences: preferences.filter((p) => !PRIVATE_PREFS.test(p.key)) },
  };
}

/** Builds a complete backup of this device's data. Call markExported() once the file is saved. */
export async function exportBackup(): Promise<Backup> {
  return db().transaction("r", [db().settings, db().cycles, db().debts, db().payments, db().ledger, db().preferences], snapshot);
}

export async function markExported(backup: Backup) {
  await db().backupMeta.put({ key: "lastExport", value: { backupId: backup.backupId }, at: nowIso() });
}

export function backupFileName(backup: Pick<Backup, "createdAt">): string {
  return `my-pay-backup-${backup.createdAt.slice(0, 16).replace(/[:T]/g, "-")}.json`;
}

// ── Import ───────────────────────────────────────────────────────────────────

export interface BackupSummary {
  backupId: string;
  createdAt: string;
  schemaVersion: number;
  source: string;
  counts: { cycles: number; debts: number; payments: number; transactions: number };
  balancePaise: number;
  outstandingDebtPaise: number;
  alreadyRestoredAt: string | null;
  currentHasData: boolean;
}

function checkConsistency(b: Backup) {
  const unique = (what: string, ids: string[]) => {
    if (new Set(ids).size !== ids.length) throw AppError.badRequest(`The backup has duplicate ${what} IDs.`);
  };
  unique("salary month", b.data.cycles.map((c) => c.cycleKey));
  unique("debt", b.data.debts.map((d) => d.id));
  unique("payment", b.data.payments.map((p) => p.id));
  unique("transaction", b.data.ledger.map((e) => e.id));
  unique("active source", b.data.ledger.filter((e) => e.sourceKey).map((e) => e.sourceKey!));
  unique("payment request", b.data.payments.filter((p) => p.requestId).map((p) => p.requestId!));
  for (const c of b.data.cycles) {
    const total = c.deductionItems.reduce((s, d) => s + d.amountPaise, 0);
    if (total !== c.totalDeductionsPaise || c.grossSalaryPaise - total !== c.finalSalaryPayablePaise) {
      throw AppError.badRequest(`The backup's ${c.label} salary totals do not add up.`);
    }
    if ((c.status === "received") !== c.received) throw AppError.badRequest(`The backup's ${c.label} salary status is inconsistent.`);
  }
  const debtIds = new Set(b.data.debts.map((d) => d.id));
  const paymentIds = new Set(b.data.payments.map((p) => p.id));
  if (b.data.payments.some((p) => !debtIds.has(p.debtId))) throw AppError.badRequest("The backup has a repayment for a debt that is not in the file.");
  if (b.data.ledger.some((e) => e.debtPaymentId && !paymentIds.has(e.debtPaymentId))) throw AppError.badRequest("The backup has a repayment transaction without its repayment record.");
  if (b.data.ledger.some((e) => e.status === "reversed" && e.sourceKey)) throw AppError.badRequest("The backup has a reversed transaction that is still marked active.");
}

function upgradeV1(json: unknown): unknown {
  const j = json as { data?: { cycles?: unknown[] } };
  if (!j.data || !Array.isArray(j.data.cycles)) return json;
  return { ...j, data: { ...j.data, cycles: j.data.cycles.map((c) => upgradeCycle(c as Parameters<typeof upgradeCycle>[0])) } };
}

/** Reads and validates a backup file's text. Throws a readable error if anything is wrong. */
export function parseBackupText(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw AppError.badRequest("This file is not valid JSON.");
  }
  const head = z.object({ format: z.string(), schemaVersion: z.number() }).safeParse(json);
  if (!head.success || head.data.format !== BACKUP_FORMAT) throw AppError.badRequest("This is not a MY PAY backup file.");
  if (head.data.schemaVersion > BACKUP_SCHEMA_VERSION) throw AppError.badRequest("This backup was made by a newer version of MY PAY. Update the app first.");
  if (head.data.schemaVersion < 1) throw AppError.badRequest("Unsupported backup version.");
  // Version 1 files (before salary deductions) are upgraded exactly like the on-device database.
  if (head.data.schemaVersion === 1) json = upgradeV1(json);
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw AppError.badRequest(`The backup file is damaged or incomplete (${issue?.path.join(".") || "file"}: ${issue?.message}).`);
  }
  checkConsistency(parsed.data);
  return parsed.data;
}

export async function summarizeBackup(b: Backup): Promise<BackupSummary> {
  const active = b.data.ledger.filter((e) => e.status === "active");
  const balancePaise = active.reduce((s, e) => s + (e.direction === "in" ? e.amountPaise : -e.amountPaise), 0);
  const repaid = new Map<string, number>();
  for (const p of b.data.payments) if (p.status === "paid") repaid.set(p.debtId, (repaid.get(p.debtId) ?? 0) + p.amountPaise);
  const outstandingDebtPaise = b.data.debts.reduce((s, d) => s + Math.max(0, d.originalAmountPaise - (repaid.get(d.id) ?? 0)), 0);
  const prior = await db().backupMeta.get(`imported:${b.backupId}`);
  const counts = await Promise.all([db().cycles.count(), db().debts.count(), db().ledger.count()]);
  return {
    backupId: b.backupId,
    createdAt: b.createdAt,
    schemaVersion: b.schemaVersion,
    source: b.source ?? "device",
    counts: { cycles: b.data.cycles.length, debts: b.data.debts.length, payments: b.data.payments.length, transactions: b.data.ledger.length },
    balancePaise,
    outstandingDebtPaise,
    alreadyRestoredAt: prior?.at ?? null,
    currentHasData: counts.some((n) => n > 0),
  };
}

const ALL_TABLES = () => [db().settings, db().cycles, db().debts, db().payments, db().ledger, db().preferences, db().backupMeta];

async function replaceData(b: Backup) {
  const d = db();
  const keepPrefs = (await d.preferences.toArray()).filter((p) => PRIVATE_PREFS.test(p.key));
  await Promise.all([d.settings.clear(), d.cycles.clear(), d.debts.clear(), d.payments.clear(), d.ledger.clear(), d.preferences.clear()]);
  await d.settings.bulkAdd(b.data.settings);
  await d.cycles.bulkAdd(b.data.cycles);
  await d.debts.bulkAdd(b.data.debts);
  await d.payments.bulkAdd(b.data.payments.map((p) => (p.requestId ? p : (({ requestId: _r, ...rest }) => (void _r, rest))(p))));
  await d.ledger.bulkAdd(b.data.ledger.map((e) => (e.sourceKey ? e : (({ sourceKey: _s, ...rest }) => (void _s, rest))(e))));
  await d.preferences.bulkPut([...b.data.preferences.filter((p) => !PRIVATE_PREFS.test(p.key)), ...keepPrefs]);
}

/**
 * Replaces ALL data on this device with the backup, in one transaction. The
 * current data is saved first as an undo snapshot. Restoring the same backup
 * twice is refused unless `allowRepeat` is set.
 */
export async function restoreBackup(b: Backup, { allowRepeat = false } = {}): Promise<void> {
  await db().transaction("rw", ALL_TABLES(), async () => {
    const prior = await db().backupMeta.get(`imported:${b.backupId}`);
    if (prior && !allowRepeat) throw AppError.conflict(`This backup was already restored on ${new Date(prior.at).toLocaleString("en-IN")}.`);
    const undo = await snapshot();
    await replaceData(b);
    const at = nowIso();
    await db().backupMeta.bulkPut([
      { key: "preRestoreSnapshot", value: undo, at },
      { key: `imported:${b.backupId}`, value: { createdAt: b.createdAt, source: b.source ?? "device" }, at },
      { key: "lastRestore", value: { backupId: b.backupId }, at },
    ]);
  });
}

// ── Merge ────────────────────────────────────────────────────────────────────
//
// Adds the backup's records that this device does not have yet, keeping every
// ID and link. Nothing already on the device is ever changed:
//   • same ID and same content       → already here, skipped
//   • same ID but different content  → conflict, this device's version is kept
//   • different ID but same unique key (a salary month credited twice, a
//     double-saved repayment)        → duplicate, skipped
// Records linked to a conflicting record (a salary credit for a month whose
// details differ, repayments of a debt whose details differ) are skipped too,
// so balances can never be counted twice. Debt balances are recalculated from
// the repayments afterwards.

/** Order-independent JSON so records read from IndexedDB and from a file compare equal. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const debtCore = (d: Backup["data"]["debts"][number]) => [d.name, d.lender, d.originalAmountPaise, d.borrowedOn, d.createdAt];

type Data = Backup["data"];
export interface MergeCounts {
  added: number;
  alreadyHere: number;
  conflicts: number;
  duplicates: number;
}
export interface MergePlan {
  add: Data;
  counts: { settings: MergeCounts; cycles: MergeCounts; debts: MergeCounts; payments: MergeCounts; transactions: MergeCounts; preferences: MergeCounts };
  conflicts: string[];
  debtsToRecalculate: string[];
  nothingToAdd: boolean;
}

const zero = (): MergeCounts => ({ added: 0, alreadyHere: 0, conflicts: 0, duplicates: 0 });

/** Works out what merging `incoming` into `local` would add. Pure: changes nothing. */
export function planMerge(incoming: Data, local: Data): MergePlan {
  const counts = { settings: zero(), cycles: zero(), debts: zero(), payments: zero(), transactions: zero(), preferences: zero() };
  const conflicts: string[] = [];
  const add: Data = { settings: [], cycles: [], debts: [], payments: [], ledger: [], preferences: [] };
  const tally = (c: MergeCounts, kind: keyof MergeCounts, message?: string) => {
    c[kind] += 1;
    if (message) conflicts.push(message);
  };

  // Settings: only filled in when this device has none.
  if (incoming.settings[0]) {
    if (!local.settings[0]) {
      add.settings.push(incoming.settings[0]);
      tally(counts.settings, "added");
    } else if (same(incoming.settings[0], local.settings[0])) tally(counts.settings, "alreadyHere");
    else tally(counts.settings, "conflicts", "Salary settings differ. This phone's settings are kept.");
  }

  const localCycles = new Map(local.cycles.map((c) => [c.cycleKey, c]));
  const blockedCycles = new Set<string>();
  for (const c of incoming.cycles) {
    const mine = localCycles.get(c.cycleKey);
    if (!mine) {
      add.cycles.push(c);
      tally(counts.cycles, "added");
    }
    else if (same(c, mine)) counts.cycles.alreadyHere++;
    else {
      counts.cycles.conflicts++;
      blockedCycles.add(c.cycleKey);
      conflicts.push(`${c.label}: the salary details differ. This phone's version (${mine.status}) is kept.`);
    }
  }

  const localDebts = new Map(local.debts.map((d) => [d.id, d]));
  const blockedDebts = new Set<string>();
  const knownDebts = new Set(local.debts.map((d) => d.id));
  for (const d of incoming.debts) {
    const mine = localDebts.get(d.id);
    if (!mine) {
      add.debts.push(d);
      knownDebts.add(d.id);
      tally(counts.debts, "added");
    }
    // Same debt; only its balance differs (because of repayments) → merge the repayments below.
    else if (same(debtCore(d), debtCore(mine))) counts.debts.alreadyHere++;
    else {
      counts.debts.conflicts++;
      blockedDebts.add(d.id);
      conflicts.push(`Debt “${mine.name}”: the details differ. This phone's version and its repayments are kept.`);
    }
  }

  const localPayments = new Map(local.payments.map((p) => [p.id, p]));
  const localRequestIds = new Set(local.payments.flatMap((p) => (p.requestId ? [p.requestId] : [])));
  const blockedPayments = new Set<string>();
  const knownPayments = new Set(local.payments.map((p) => p.id));
  const touchedDebts = new Set<string>();
  for (const p of incoming.payments) {
    const mine = localPayments.get(p.id);
    if (mine) {
      if (same(p, mine)) counts.payments.alreadyHere++;
      else {
        blockedPayments.add(p.id);
        tally(counts.payments, "conflicts", `A repayment of ₹${(p.amountPaise / 100).toFixed(2)} on ${p.paymentDate} differs. This phone's version is kept.`);
      }
    } else if (blockedDebts.has(p.debtId) || !knownDebts.has(p.debtId)) {
      counts.payments.conflicts++;
      blockedPayments.add(p.id);
    } else if (p.requestId && localRequestIds.has(p.requestId)) {
      counts.payments.duplicates++;
      blockedPayments.add(p.id);
    } else {
      add.payments.push(p);
      counts.payments.added++;
      knownPayments.add(p.id);
      touchedDebts.add(p.debtId);
    }
  }

  const localEntries = new Map(local.ledger.map((e) => [e.id, e]));
  const localSourceKeys = new Set(local.ledger.flatMap((e) => (e.sourceKey ? [e.sourceKey] : [])));
  for (const e of incoming.ledger) {
    const mine = localEntries.get(e.id);
    if (mine) {
      if (same(e, mine)) counts.transactions.alreadyHere++;
      else tally(counts.transactions, "conflicts", `Transaction “${e.description || e.category}” on ${e.date} differs. This phone's version is kept.`);
      continue;
    }
    const linkedToConflict =
      (e.salaryCycleKey && blockedCycles.has(e.salaryCycleKey) && e.kind === "salary") ||
      (e.debtId && blockedDebts.has(e.debtId)) ||
      (e.debtPaymentId && (blockedPayments.has(e.debtPaymentId) || !knownPayments.has(e.debtPaymentId)));
    if (linkedToConflict) counts.transactions.conflicts++;
    else if (e.sourceKey && localSourceKeys.has(e.sourceKey)) counts.transactions.duplicates++;
    else {
      add.ledger.push(e);
      tally(counts.transactions, "added");
    }
  }

  const localPrefs = new Set(local.preferences.map((p) => p.key));
  for (const p of incoming.preferences) {
    if (PRIVATE_PREFS.test(p.key)) continue;
    if (localPrefs.has(p.key)) counts.preferences.alreadyHere++;
    else {
      add.preferences.push(p);
      tally(counts.preferences, "added");
    }
  }

  const nothingToAdd = Object.values(add).every((list) => list.length === 0);
  return { add, counts, conflicts, debtsToRecalculate: [...touchedDebts].filter((id) => localDebts.has(id)), nothingToAdd };
}

const stripKey = <T extends object, K extends keyof T>(rec: T, key: K): T => {
  if (rec[key] !== undefined) return rec;
  const copy = { ...rec };
  delete copy[key];
  return copy;
};

/** Previews a merge against this device's current data. */
export async function previewMerge(b: Backup): Promise<MergePlan> {
  return planMerge(b.data, (await exportBackup()).data);
}

/**
 * Merges the backup into this device's data in one transaction (see above).
 * The data before the merge is kept, so “Undo last restore” can bring it back.
 */
export async function mergeBackup(b: Backup): Promise<MergePlan> {
  return db().transaction("rw", ALL_TABLES(), async () => {
    const before = await snapshot();
    const plan = planMerge(b.data, before.data);
    if (plan.nothingToAdd) return plan;
    const d = db();
    const { add } = plan;
    await d.settings.bulkAdd(add.settings);
    await d.cycles.bulkAdd(add.cycles);
    await d.debts.bulkAdd(add.debts);
    await d.payments.bulkAdd(add.payments.map((p) => stripKey(p, "requestId")));
    await d.ledger.bulkAdd(add.ledger.map((e) => stripKey(e, "sourceKey")));
    await d.preferences.bulkAdd(add.preferences);
    // Existing debts that received repayments from the backup: balance = original − repaid.
    for (const debtId of plan.debtsToRecalculate) {
      const debt = await d.debts.get(debtId);
      if (!debt) continue;
      const repaid = (await d.payments.where("debtId").equals(debtId).toArray()).filter((p) => p.status === "paid").reduce((s, p) => s + p.amountPaise, 0);
      const remaining = Math.max(0, debt.originalAmountPaise - repaid);
      await d.debts.put({ ...debt, remainingPaise: remaining, status: remaining === 0 ? "paid" : "active", updatedAt: nowIso() });
    }
    const at = nowIso();
    await d.backupMeta.bulkPut([
      { key: "preRestoreSnapshot", value: before, at },
      { key: `imported:${b.backupId}`, value: { createdAt: b.createdAt, source: b.source ?? "device", mode: "merge" }, at },
      { key: "lastRestore", value: { backupId: b.backupId, mode: "merge" }, at },
    ]);
    return plan;
  });
}

/** Puts back the data that was on this device before the last restore. */
export async function undoLastRestore(): Promise<void> {
  await db().transaction("rw", ALL_TABLES(), async () => {
    const snap = await db().backupMeta.get("preRestoreSnapshot");
    if (!snap) throw AppError.notFound("There is no restore to undo.");
    const lastRestore = (await db().backupMeta.get("lastRestore"))?.value as { backupId?: string } | undefined;
    await replaceData(backupSchema.parse(snap.value));
    await db().backupMeta.delete("preRestoreSnapshot");
    if (lastRestore?.backupId) await db().backupMeta.delete(`imported:${lastRestore.backupId}`);
  });
}

/** Deletes every financial record on this device (the PIN is kept). */
export async function resetAllData(): Promise<void> {
  await db().transaction("rw", ALL_TABLES(), async () => {
    const d = db();
    const keepPrefs = (await d.preferences.toArray()).filter((p) => PRIVATE_PREFS.test(p.key));
    await Promise.all([d.settings.clear(), d.cycles.clear(), d.debts.clear(), d.payments.clear(), d.ledger.clear(), d.preferences.clear(), d.backupMeta.clear()]);
    await d.preferences.bulkPut(keepPrefs);
  });
}

// ── Status ───────────────────────────────────────────────────────────────────

export interface BackupStatus {
  lastExportAt: string | null;
  lastRestoreAt: string | null;
  daysSinceExport: number | null;
  reminder: boolean;
  canUndoRestore: boolean;
}

export async function backupStatus(now = new Date()): Promise<BackupStatus> {
  const [exp, res, snap, entries, debts]: [BackupMetaRecord | undefined, BackupMetaRecord | undefined, BackupMetaRecord | undefined, number, number] = await Promise.all([
    db().backupMeta.get("lastExport"),
    db().backupMeta.get("lastRestore"),
    db().backupMeta.get("preRestoreSnapshot"),
    db().ledger.count(),
    db().debts.count(),
  ]);
  const days = exp ? Math.floor((now.getTime() - new Date(exp.at).getTime()) / 86_400_000) : null;
  return {
    lastExportAt: exp?.at ?? null,
    lastRestoreAt: res?.at ?? null,
    daysSinceExport: days,
    reminder: entries + debts > 0 && (days === null || days >= BACKUP_REMINDER_DAYS),
    canUndoRestore: Boolean(snap),
  };
}
