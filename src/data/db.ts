import Dexie, { type EntityTable } from "dexie";
import type { Direction, LedgerKind, LedgerStatus, SalarySettingsValues } from "@/lib/types";
import { upgradeCycle } from "./cycle-migrate";

// MY PAY keeps every record on this device, in IndexedDB (via Dexie).
// Nothing is sent to a server. Money is integer paise; dates are "YYYY-MM-DD"
// in Asia/Kolkata; salary months are "YYYY-MM".
//
// Schema changes MUST add a new `db.version(n)` with an upgrade function and
// bump BACKUP_SCHEMA_VERSION in backup.ts if the backup format changes.

export const DB_NAME = "my-pay";

export interface SettingsRecord extends SalarySettingsValues {
  id: "salary";
  updatedAt: string;
}

export interface DeductionItem {
  id: string;
  category: string; // DEDUCTION_CATEGORIES value
  description: string;
  amountPaise: number; // > 0
  deductionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Immutable copy of a finalized calculation. Kept forever (reopening only stamps reopenedAt). */
export interface SalarySnapshot {
  finalizedAt: string;
  basicSalaryPaise: number;
  salaryDivisor: number;
  standardDailyHours: number;
  overtimeMultiplier: number;
  workingMinutes: number;
  overtimeInput: string;
  overtimeMinutes: number;
  hourlySalaryExact: string;
  overtimeEarningsPaise: number;
  grossSalaryPaise: number;
  deductionItems: DeductionItem[];
  totalDeductionsPaise: number;
  finalSalaryPayablePaise: number;
  reopenedAt: string | null;
  reopenReason: string;
}

export interface CycleRecord {
  cycleKey: string; // "2026-10" (month worked)
  label: string;
  startDate: string; // inclusive
  endDate: string; // exclusive
  payDate: string;
  basicSalaryPaise: number;
  salaryDivisor: number;
  standardDailyHours: number;
  overtimeMultiplier: number;
  workingMinutes: number;
  overtimeInput: string;
  overtimeMinutes: number;
  dailySalaryExact: string;
  hourlySalaryExact: string;
  dailySalaryPaise: number;
  hourlySalaryPaise: number;
  overtimeEarningsPaise: number;
  totalEarningsPaise: number; // gross salary (basic + overtime); kept for older records
  calculatorVersion: number;
  deductionItems: DeductionItem[];
  totalDeductionsPaise: number;
  grossSalaryPaise: number;
  finalSalaryPayablePaise: number; // gross − deductions; the ONLY amount ever credited
  status: "draft" | "finalized" | "received";
  finalizedAt: string | null;
  receivedAt: string | null; // date and time it was marked received
  receivedLedgerTransactionId: string | null;
  finalizations: SalarySnapshot[];
  notes: string;
  received: boolean; // mirrors status === "received"
  receivedOn: string | null; // date the money arrived
  receivedAmountPaise: number | null;
  ledgerEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebtRecord {
  id: string;
  name: string;
  lender: string;
  originalAmountPaise: number;
  remainingPaise: number;
  status: "active" | "paid";
  borrowedOn: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  debtId: string;
  amountPaise: number;
  paymentDate: string;
  status: "paid" | "reversed";
  notes: string;
  requestId?: string; // unique: a double tap never records twice
  reversedAt: string | null;
  reversalReason: string;
  createdAt: string;
}

export interface LedgerRecord {
  id: string;
  direction: Direction;
  kind: LedgerKind;
  category: string;
  amountPaise: number;
  date: string;
  description: string;
  salaryCycleKey: string | null;
  debtId: string | null;
  debtPaymentId: string | null;
  /** Unique while the entry is active ("salary:2026-10", "debtpay:<id>", "req:<id>"). Removed on reversal. */
  sourceKey?: string;
  reversedSourceKey: string | null;
  status: LedgerStatus;
  reversedAt: string | null;
  reversalReason: string;
  correctionOf: string | null;
  createdAt: string;
}

export interface PreferenceRecord {
  key: string;
  value: unknown;
}

export interface BackupMetaRecord {
  key: string; // "lastExport" | "lastRestore" | "imported:<backupId>" | "preRestoreSnapshot"
  value: unknown;
  at: string;
}

export class MyPayDB extends Dexie {
  settings!: EntityTable<SettingsRecord, "id">;
  cycles!: EntityTable<CycleRecord, "cycleKey">;
  debts!: EntityTable<DebtRecord, "id">;
  payments!: EntityTable<PaymentRecord, "id">;
  ledger!: EntityTable<LedgerRecord, "id">;
  preferences!: EntityTable<PreferenceRecord, "key">;
  backupMeta!: EntityTable<BackupMetaRecord, "key">;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      settings: "id",
      cycles: "cycleKey, received",
      debts: "id, status, borrowedOn",
      payments: "id, debtId, paymentDate, status, &requestId",
      ledger: "id, date, kind, status, direction, category, debtId, debtPaymentId, &sourceKey, [status+direction]",
      preferences: "key",
      backupMeta: "key",
    });
    // v2: salary deductions, DRAFT → FINALIZED → RECEIVED, finalization snapshots.
    this.version(2)
      .stores({ cycles: "cycleKey, received, status" })
      .upgrade((tx) => tx.table("cycles").toCollection().modify((c, ref) => {
        ref.value = upgradeCycle(c);
      }));
  }
}

let instance: MyPayDB | null = null;

/** The app database (opened lazily, only in the browser or in tests). */
export function db(): MyPayDB {
  if (!instance) instance = new MyPayDB();
  return instance;
}

/** Tests only: drop the cached instance so the next call reopens the database. */
export async function resetDbInstance() {
  if (instance) instance.close();
  instance = null;
}

export const nowIso = () => new Date().toISOString();

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
