import { todayKey } from "@/lib/dates";
import { shiftCycle } from "@/lib/salary-cycle";
import { calculateManualSalary } from "@/lib/salary-calculator";
import { availableBalance, listEntries, periodSummary, type LedgerEntryView, type PeriodSummary } from "./ledger";
import { listDebts, summarizeDebts, type DebtOverview } from "./debts";
import { getCycleState, type CycleState } from "./cycles";
import { calculatorParams } from "./settings";
import { backupStatus, type BackupStatus } from "./backup";

export interface SalaryCard {
  state: CycleState;
  basicSalaryPaise: number;
  overtimeMinutes: number;
  overtimeEarningsPaise: number;
  grossPaise: number;
  deductionsPaise: number;
  /** Final salary payable (gross − deductions): what is credited when received. */
  totalPaise: number;
  saved: boolean;
}

export interface DashboardData {
  today: string;
  balancePaise: number;
  debts: DebtOverview;
  balanceAfterDebtPaise: number;
  salary: SalaryCard;
  /** Last month, when its salary is not marked as received yet. */
  pendingPrevious: SalaryCard | null;
  period: PeriodSummary;
  recent: LedgerEntryView[];
  backup: BackupStatus;
}

function salaryCard(state: CycleState): SalaryCard {
  if (state.record) {
    const r = state.record;
    return { state, basicSalaryPaise: r.basicSalaryPaise, overtimeMinutes: r.overtimeMinutes, overtimeEarningsPaise: r.overtimeEarningsPaise, grossPaise: r.grossSalaryPaise, deductionsPaise: r.totalDeductionsPaise, totalPaise: r.finalSalaryPayablePaise, saved: true };
  }
  const r = calculateManualSalary(state.settings.monthlyBasicSalaryPaise, 0, calculatorParams(state.settings));
  return { state, basicSalaryPaise: r.monthlySalaryPaise, overtimeMinutes: 0, overtimeEarningsPaise: 0, grossPaise: r.totalPaise, deductionsPaise: 0, totalPaise: r.totalPaise, saved: false };
}

export async function getDashboard(): Promise<DashboardData> {
  const state = await getCycleState();
  const previous = await getCycleState(shiftCycle(state.currentKey, -1));
  const [balance, debts, period, recent, backup] = await Promise.all([
    availableBalance(),
    listDebts(),
    periodSummary(state.cycle.startDate, state.cycle.endDate),
    listEntries({ limit: 5 }),
    backupStatus(),
  ]);
  const overview = summarizeDebts(debts);
  return {
    today: todayKey(state.settings.timezone),
    balancePaise: balance.balancePaise,
    debts: overview,
    balanceAfterDebtPaise: balance.balancePaise - overview.totalOutstandingPaise,
    salary: salaryCard(state),
    pendingPrevious: previous.record?.received ? null : salaryCard(previous),
    period,
    recent,
    backup,
  };
}
