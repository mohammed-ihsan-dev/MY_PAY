import Link from "next/link";
import { AlertCircle, ArrowRight, ChevronRight, HandCoins, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickAdd } from "@/components/transactions/quick-add";
import { EntryRow } from "@/components/transactions/entry-row";
import { BackupReminder } from "@/components/settings/backup-reminder";
import { SalaryStatusBadge } from "@/components/salary/salary-status-badge";
import { formatINR } from "@/lib/money";
import { formatCyclePeriod, formatPayDate } from "@/lib/salary-cycle";
import { describeDuration } from "@/lib/salary-calculator";
import { categoryLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { DashboardData, SalaryCard } from "@/data/dashboard";

function Row({ label, value, tone, strong, hint }: { label: string; value: string; tone?: "in" | "out"; strong?: boolean; hint?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-2", strong && "mt-1 border-t pt-3")}>
      <span className={cn("text-sm", strong ? "font-semibold" : "text-muted-foreground")}>
        {label}
        {hint && <span className="block text-[11px] font-normal text-muted-foreground">{hint}</span>}
      </span>
      <span className={cn("tabular shrink-0 text-sm font-medium", strong && "text-base font-semibold", tone === "in" && "text-success", tone === "out" && "text-danger")}>{value}</span>
    </div>
  );
}

function SalaryStatus({ card }: { card: SalaryCard }) {
  if (!card.saved) return <Badge variant="neutral">Not entered yet</Badge>;
  return <SalaryStatusBadge status={card.state.record!.status} />;
}

export function DashboardView({ data, firstName, autoAdd }: { data: DashboardData; firstName: string; autoAdd?: "expense" | "income" }) {
  const { salary, period, debts } = data;
  const cycle = salary.state.cycle;
  const maxExpense = Math.max(1, ...period.expensesByCategory.map((c) => c.amountPaise));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Hello, {firstName}</p>
        <h1 className="text-[13px] font-semibold uppercase tracking-wide">{cycle.label} salary</h1>
        <p className="tabular text-xs text-muted-foreground">
          Period: {formatCyclePeriod(cycle)} · Paid on {formatPayDate(cycle)}
        </p>
      </div>

      {/* A + D: available balance and the projection after clearing all debt */}
      <section className="rounded-3xl bg-hero p-5 text-hero-foreground sm:p-6" aria-label="Available balance">
        <p className="text-sm font-medium text-hero-muted">Available balance</p>
        <p className={cn("tabular mt-1 text-[2.4rem] font-semibold leading-none tracking-tight sm:text-5xl", data.balancePaise < 0 && "text-[#ffb4a3]")}>{formatINR(data.balancePaise)}</p>
        <p className="mt-2 text-xs text-hero-muted">Everything received minus everything spent and repaid. Carries forward every month.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-white/8 p-3.5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-hero-muted">Outstanding debt</p>
            <p className="tabular mt-0.5 truncate text-lg font-semibold">{formatINR(debts.totalOutstandingPaise)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-hero-muted">Balance after clearing all debt</p>
            <p className={cn("tabular mt-0.5 truncate text-lg font-semibold", data.balanceAfterDebtPaise < 0 && "text-[#ffb4a3]")}>{formatINR(data.balanceAfterDebtPaise)}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-hero-muted">Projection only. Nothing is deducted until you record a repayment.</p>
      </section>

      <QuickAdd today={data.today} autoOpen={autoAdd} />

      {data.pendingPrevious && (
        <Link href={`/salary?cycle=${data.pendingPrevious.state.cycle.key}`} className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm transition hover:brightness-[0.98]">
          <AlertCircle className="size-5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{data.pendingPrevious.state.cycle.label} salary</span> (due {formatPayDate(data.pendingPrevious.state.cycle)}) is {data.pendingPrevious.state.record?.status === "finalized" ? "finalized but not received yet" : "not received yet"}.
            <span className="block text-xs text-muted-foreground">{data.pendingPrevious.state.record?.status === "finalized" ? "When it arrives, mark it as received" : "Add any deductions, finalize, then mark it received"} to add {formatINR(data.pendingPrevious.totalPaise)} to your balance.</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {data.backup.reminder && <BackupReminder status={data.backup} />}

      <div className="grid gap-4 md:grid-cols-2">
        {/* B: current salary */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4 text-primary" /> Current salary
            </CardTitle>
            <SalaryStatus card={salary} />
          </CardHeader>
          <CardContent>
            <Row label="Basic salary" value={formatINR(salary.basicSalaryPaise)} />
            <Row label="Overtime earnings" hint={salary.overtimeMinutes ? describeDuration(salary.overtimeMinutes) : "No overtime entered"} value={formatINR(salary.overtimeEarningsPaise)} tone="in" />
            {salary.deductionsPaise > 0 && <Row label="Deductions" value={`−${formatINR(salary.deductionsPaise)}`} tone="out" />}
            <Row label="Final salary payable" value={formatINR(salary.totalPaise)} strong />
            <Link href="/salary" className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-secondary text-sm font-medium text-secondary-foreground transition hover:bg-secondary/70">
              {salary.saved ? "Update hours & overtime" : "Enter hours & overtime"} <ArrowRight className="size-4" />
            </Link>
            <Link href="/settings#salary" className="mt-2 block text-center text-xs font-medium text-muted-foreground hover:text-primary">
              Change salary
            </Link>
          </CardContent>
        </Card>

        {/* C: debt overview */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2">
              <HandCoins className="size-4 text-primary" /> Debt overview
            </CardTitle>
            <Badge variant={debts.activeCount ? "warning" : "success"}>{debts.activeCount} active</Badge>
          </CardHeader>
          <CardContent>
            <Row label="Total outstanding" value={formatINR(debts.totalOutstandingPaise)} tone={debts.totalOutstandingPaise ? "out" : undefined} />
            <Row label="Total repaid" value={formatINR(debts.totalRepaidPaise)} />
            <Row label="Active debts" value={String(debts.activeCount)} />
            <Link href="/debts" className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-secondary text-sm font-medium text-secondary-foreground transition hover:bg-secondary/70">
              Open Debt Manager <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* E: this cycle's money summary */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle>This month</CardTitle>
          <span className="tabular text-xs text-muted-foreground">{formatCyclePeriod(cycle)}</span>
        </CardHeader>
        <CardContent className="grid gap-x-8 md:grid-cols-2">
          <div>
            <Row label="Carried forward" hint="Balance from earlier months" value={formatINR(period.openingBalancePaise)} />
            <Row label="Salary received" value={`+${formatINR(period.salaryReceivedPaise)}`} tone="in" />
            <Row label="Overtime earnings" hint={`Earned this month, paid ${formatPayDate(cycle)}`} value={formatINR(salary.overtimeEarningsPaise)} />
            <Row label="Other income" value={`+${formatINR(period.otherIncomePaise)}`} tone="in" />
            <Row label="Expenses" value={`−${formatINR(period.expensesPaise)}`} tone="out" />
            <Row label="Debt repayments" value={`−${formatINR(period.debtRepaymentsPaise)}`} tone="out" />
            <Row label="Remaining available balance" value={formatINR(period.closingBalancePaise)} strong />
          </div>
          <div className="mt-4 md:mt-0">
            <p className="mb-2 text-sm font-medium">Where the money went</p>
            {period.expensesByCategory.length === 0 ? (
              <p className="rounded-xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground">No expenses this month yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {period.expensesByCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{categoryLabel(c.category)}</span>
                      <span className="tabular text-muted-foreground">{formatINR(c.amountPaise)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(3, (c.amountPaise / maxExpense) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Recent transactions</CardTitle>
          <Link href="/history" className="text-sm font-medium text-primary hover:underline">
            See all
          </Link>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <EmptyState icon={Wallet} title="Nothing recorded yet" description="Mark a salary as received or add an expense to get started." />
          ) : (
            <ul className="divide-y">
              {data.recent.map((e) => (
                <li key={e.id} className="py-2.5 first:pt-0 last:pb-0">
                  <EntryRow entry={e} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
