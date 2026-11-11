import type { CycleRecord, DeductionItem, SalarySnapshot } from "./db";

// Brings a salary month saved by an earlier version (before deductions and
// statuses existed) up to date. Used by the IndexedDB upgrade AND when
// restoring an older backup file, so both paths give identical results.
//
// - Never-received months become DRAFT with no deductions.
// - Received months become RECEIVED with a finalization snapshot. If less was
//   received than the gross salary, the difference is recorded as one
//   "Other Deduction" so that gross − deductions = the amount credited.

type V1Cycle = Omit<CycleRecord, "deductionItems" | "totalDeductionsPaise" | "grossSalaryPaise" | "finalSalaryPayablePaise" | "status" | "finalizedAt" | "receivedAt" | "receivedLedgerTransactionId" | "finalizations"> &
  Partial<CycleRecord>;

export function upgradeCycle(c: V1Cycle): CycleRecord {
  if (c.status && Array.isArray(c.deductionItems) && Array.isArray(c.finalizations)) return c as CycleRecord;
  const gross = c.totalEarningsPaise;
  const deductionItems: DeductionItem[] = [];
  if (c.received && c.receivedAmountPaise !== null && c.receivedAmountPaise < gross) {
    deductionItems.push({
      id: `imported-${c.cycleKey}`,
      category: "other_deduction",
      description: "Difference between calculated and received salary (from an earlier version)",
      amountPaise: gross - c.receivedAmountPaise,
      deductionDate: null,
      createdAt: c.updatedAt,
      updatedAt: c.updatedAt,
    });
  }
  const total = deductionItems.reduce((s, d) => s + d.amountPaise, 0);
  const final = c.received && c.receivedAmountPaise !== null ? c.receivedAmountPaise : gross - total;
  const base = {
    ...c,
    deductionItems,
    totalDeductionsPaise: total,
    grossSalaryPaise: gross,
    finalSalaryPayablePaise: final,
    receivedLedgerTransactionId: c.ledgerEntryId ?? null,
  };
  if (!c.received) return { ...base, status: "draft", finalizedAt: null, receivedAt: null, finalizations: [] };
  const snapshot: SalarySnapshot = {
    finalizedAt: c.updatedAt,
    basicSalaryPaise: c.basicSalaryPaise,
    salaryDivisor: c.salaryDivisor,
    standardDailyHours: c.standardDailyHours,
    overtimeMultiplier: c.overtimeMultiplier,
    workingMinutes: c.workingMinutes,
    overtimeInput: c.overtimeInput,
    overtimeMinutes: c.overtimeMinutes,
    hourlySalaryExact: c.hourlySalaryExact,
    overtimeEarningsPaise: c.overtimeEarningsPaise,
    grossSalaryPaise: gross,
    deductionItems,
    totalDeductionsPaise: total,
    finalSalaryPayablePaise: final,
    reopenedAt: null,
    reopenReason: "",
  };
  return { ...base, status: "received", finalizedAt: c.updatedAt, receivedAt: c.updatedAt, finalizations: [snapshot] };
}
