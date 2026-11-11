"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, FileCheck2, History, Loader2, Lock, Pencil, Plus, ReceiptText, RotateCcw, Save, Trash2, Undo2, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CycleNav } from "@/components/shared/cycle-nav";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { errorMessage } from "@/lib/errors";
import { finalizeCycle, receiveSalary, removeDeduction, reopenCycle, saveCycle, undoReceived } from "@/data/cycles";
import { formatINR, paiseToRupees } from "@/lib/money";
import { formatDateKey, formatDateTime } from "@/lib/dates";
import { formatCyclePeriod, formatPayDate } from "@/lib/salary-cycle";
import { calculateManualSalary, describeDuration, exactRupees, finalPayable, formatHMM, parseMonthlySalary, parseOvertimeDuration, type CalculatorParams } from "@/lib/salary-calculator";
import { deductionLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { CycleRecordView, CycleState, DeductionItem, SalarySnapshot } from "@/data/cycles";
import { SalaryInput } from "./salary-input";
import { OvertimeDurationInput } from "./overtime-duration-input";
import { WorkingHoursInput } from "./working-hours-input";
import { DeductionDialog } from "./deduction-dialog";
import { SalaryStatusBadge } from "./salary-status-badge";

function settingsParams(s: CycleState["settings"]): CalculatorParams {
  return { salaryDivisorDays: s.salaryDivisor, standardWorkingHours: s.standardDailyHours, overtimeMultiplier: s.overtimeMultiplier };
}

function Line({ label, value, sub, tone, strong }: { label: string; value: string; sub?: string; tone?: "plus" | "minus"; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", strong && "border-t pt-2.5")}>
      <span className={cn("text-sm", strong ? "font-semibold" : "text-muted-foreground")}>
        {label}
        {sub && <span className="block text-[11px] text-muted-foreground">{sub}</span>}
      </span>
      <span className={cn("tabular shrink-0 text-right text-sm font-medium", strong && "text-base font-semibold", tone === "plus" && "text-success", tone === "minus" && "text-danger")}>{value}</span>
    </div>
  );
}

export function SalaryView({ state, history, today }: { state: CycleState; history: CycleRecordView[]; today: string }) {
  const { cycle, record, settings } = state;
  const status = record?.status ?? "draft";
  const locked = status !== "draft";

  const initial = {
    basic: String(paiseToRupees(record?.basicSalaryPaise || settings.monthlyBasicSalaryPaise)),
    hours: record ? String(Math.floor(record.workingMinutes / 60)) : "",
    minutes: record ? String(record.workingMinutes % 60) : "",
    overtime: record?.overtimeInput ?? "",
    notes: record?.notes ?? "",
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState<null | "save" | "apply" | "prepare">(null);
  const [dialog, setDialog] = useState<null | "finalize" | "receive" | "reopen" | "undo">(null);
  const [deduction, setDeduction] = useState<{ n: number; item?: DeductionItem } | null>(null);
  const [removing, setRemoving] = useState<DeductionItem | null>(null);
  const norm = (f: typeof form) => [f.basic.trim(), Number(f.hours || 0), Number(f.minutes || 0), f.overtime.trim(), f.notes.trim()].join("|");
  const dirty = !locked && norm(form) !== norm(initial);

  const params = record ? record.params : settingsParams(settings);
  const salary = parseMonthlySalary(form.basic);
  const overtime = parseOvertimeDuration(form.overtime);
  const minutesError = Number(form.minutes || 0) > 59 ? "Minutes must be between 0 and 59." : null;
  const deductions = record?.deductionItems ?? [];
  const calc = useMemo(
    () => (salary.ok && overtime.ok ? calculateManualSalary(salary.value, overtime.value.totalMinutes, params) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.basic, form.overtime, params.salaryDivisorDays, params.standardWorkingHours, params.overtimeMultiplier]
  );
  // Locked months show the stored (finalized) numbers; drafts recalculate live.
  const shown =
    locked && record
      ? { basic: record.basicSalaryPaise, ot: record.overtimeEarningsPaise, otMinutes: record.overtimeMinutes, hourly: record.hourlySalaryExact, gross: record.grossSalaryPaise, payable: finalPayable(record.grossSalaryPaise, deductions) }
      : calc
        ? { basic: calc.monthlySalaryPaise, ot: calc.overtimePaymentPaise, otMinutes: calc.overtimeMinutes, hourly: calc.hourlySalaryExact, gross: calc.totalPaise, payable: finalPayable(calc.totalPaise, deductions) }
        : null;
  const inputsOk = Boolean(calc) && !minutesError;
  const valid = inputsOk && !shown?.payable.error;

  const body = (applyCurrentSettings = false) => ({
    basicSalary: form.basic,
    workingHours: Number(form.hours || 0),
    workingMinutes: Number(form.minutes || 0),
    overtime: form.overtime,
    notes: form.notes,
    applyCurrentSettings,
  });

  /** Saves the draft inputs if they changed (or were never saved). */
  const ensureSaved = async () => {
    if (!locked && (dirty || !record)) await saveCycle(cycle.key, body());
  };

  const run = async (kind: "save" | "apply" | "prepare", fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const snapshots = record?.finalizations ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Salary</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Salary → overtime → deductions → finalize → received.</p>
        </div>
        <SalaryStatusBadge status={status} className="mt-1 shrink-0" />
      </div>

      <CycleNav cycle={cycle} currentKey={state.currentKey} basePath="/salary" className="rounded-2xl border bg-card p-2" />

      {status === "received" && record && (
        <div className="flex flex-col gap-3 rounded-2xl border border-success/25 bg-success-soft p-4 sm:flex-row sm:items-center">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">
              Received {formatINR(record.receivedAmountPaise ?? record.finalSalaryPayablePaise)} on {formatDateKey(record.receivedOn!)}
            </p>
            <p className="text-xs text-muted-foreground">Added to your balance{record.receivedAt ? ` · marked ${formatDateTime(record.receivedAt)}` : ""}.</p>
          </div>
          <Button variant="outline" onClick={() => setDialog("undo")}>
            <Undo2 /> Undo received
          </Button>
        </div>
      )}
      {status === "finalized" && record && (
        <div className="flex flex-col gap-3 rounded-2xl border border-info/25 bg-info-soft p-4 sm:flex-row sm:items-center">
          <Lock className="size-5 shrink-0 text-info" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Finalized {record.finalizedAt ? formatDateTime(record.finalizedAt) : ""}</p>
            <p className="text-xs text-muted-foreground">Locked. Nothing is added to your balance until you mark it as received.</p>
          </div>
          <Button variant="outline" onClick={() => setDialog("reopen")}>
            <Unlock /> Reopen to edit
          </Button>
        </div>
      )}
      {state.settingsDiffer && !locked && (
        <div className="flex flex-col gap-3 rounded-2xl border bg-cream p-4 text-sm sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1">
            Settings changed after this month was saved. It still uses {params.salaryDivisorDays} days, {params.standardWorkingHours} hours a day and ×{params.overtimeMultiplier} overtime.
          </p>
          <Button
            variant="outline"
            disabled={busy !== null || !inputsOk}
            onClick={() =>
              run("apply", async () => {
                await saveCycle(cycle.key, body(true));
                toast.success("Current settings applied");
              })
            }
          >
            {busy === "apply" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Use current settings
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {/* A. Salary overview */}
          <section aria-labelledby="sec-overview" className="space-y-3">
            <h2 id="sec-overview" className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              A · Salary overview
            </h2>
            <fieldset disabled={locked} className="space-y-3 disabled:opacity-75">
              <legend className="sr-only">Salary inputs</legend>
              <SalaryInput value={form.basic} onChange={(basic) => setForm({ ...form, basic })} error={salary.ok ? null : salary.error} />
              <WorkingHoursInput hours={form.hours} minutes={form.minutes} onChange={(hours, minutes) => setForm({ ...form, hours, minutes })} error={minutesError} />
              <OvertimeDurationInput value={form.overtime} onChange={(o) => setForm({ ...form, overtime: o })} parsed={overtime} />
            </fieldset>
            {shown && (
              <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3.5 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Hourly salary</p>
                  <p className="tabular font-semibold">₹{exactRupees(shown.hourly, 4)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overtime earnings</p>
                  <p className="tabular font-semibold text-success">{formatINR(shown.ot)}</p>
                  <p className="text-[11px] text-muted-foreground">{shown.otMinutes ? `${describeDuration(shown.otMinutes)} (${formatHMM(shown.otMinutes)})` : "No overtime"}</p>
                </div>
              </div>
            )}
          </section>

          {/* B. Salary deductions */}
          <section aria-labelledby="sec-deductions">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle id="sec-deductions" className="flex items-center gap-2">
                  <ReceiptText className="size-4 text-primary" /> B · Salary deductions
                </CardTitle>
                {deductions.length > 0 && <span className="tabular text-sm font-semibold text-danger">−{formatINR(record!.totalDeductionsPaise)}</span>}
              </CardHeader>
              <CardContent className="space-y-3">
                {deductions.length === 0 ? (
                  <p className="rounded-xl bg-muted px-3 py-3 text-center text-sm text-muted-foreground">No deductions this month.</p>
                ) : (
                  <ul className="divide-y rounded-xl border" aria-label="Deductions">
                    {deductions.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{deductionLabel(d.category)}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[d.description, d.deductionDate && formatDateKey(d.deductionDate, "dd MMM")].filter(Boolean).join(" · ") || "No description"}
                          </p>
                        </div>
                        <span className="tabular shrink-0 text-sm font-semibold text-danger">−{formatINR(d.amountPaise)}</span>
                        {!locked && (
                          <>
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${deductionLabel(d.category)}`} onClick={() => setDeduction({ n: Date.now(), item: d })}>
                              <Pencil />
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${deductionLabel(d.category)}`} className="text-danger" onClick={() => setRemoving(d)}>
                              <Trash2 />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {!locked && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full border-dashed"
                    disabled={busy !== null || !inputsOk}
                    onClick={() =>
                      run("prepare", async () => {
                        await ensureSaved();
                        setDeduction({ n: Date.now() });
                      })
                    }
                  >
                    {busy === "prepare" ? <Loader2 className="animate-spin" /> : <Plus />} Add Deduction
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">Fines are taken off the salary before it is paid. They are not expenses and never reduce your balance separately.</p>
              </CardContent>
            </Card>
          </section>

          {!locked && (
            <div className="rounded-2xl border bg-card p-4">
              <Field label="Notes (optional)" htmlFor="salary-notes">
                <Input id="salary-notes" maxLength={300} placeholder="e.g. includes Diwali week overtime" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
          )}
        </div>

        {/* C. Final salary breakdown + actions */}
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <section aria-labelledby="sec-final">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle id="sec-final">C · Final salary</CardTitle>
                {!locked && record && <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "Saved draft"}</span>}
              </CardHeader>
              <CardContent>
                {shown ? (
                  <>
                    <Line label="Basic salary" value={formatINR(shown.basic)} />
                    <Line label="Overtime earnings" value={`+ ${formatINR(shown.ot)}`} tone="plus" />
                    <Line label="Gross salary" value={formatINR(shown.gross)} strong />
                    <Line label="Total deductions" sub={deductions.length ? `${deductions.length} item${deductions.length === 1 ? "" : "s"}` : undefined} value={`− ${formatINR(shown.payable.totalDeductionsPaise)}`} tone="minus" />
                    <div className={cn("mt-3 rounded-2xl p-4", shown.payable.error ? "bg-danger-soft" : "bg-hero text-hero-foreground")} aria-live="polite">
                      <p className={cn("text-xs font-medium", shown.payable.error ? "text-danger" : "text-hero-muted")}>Final salary payable</p>
                      <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{formatINR(shown.payable.finalSalaryPayablePaise)}</p>
                      <p className={cn("mt-1 text-[11px]", shown.payable.error ? "font-medium text-danger" : "text-hero-muted")}>
                        {shown.payable.error ?? `Paid ${formatPayDate(cycle)}. Only this amount is added to your balance.`}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl bg-danger-soft px-3 py-4 text-sm text-danger">Fix the highlighted input to see the calculation.</p>
                )}
              </CardContent>
            </Card>
          </section>

          {status === "draft" && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="lg"
                variant="outline"
                disabled={busy !== null || !inputsOk || (!dirty && Boolean(record))}
                onClick={() =>
                  run("save", async () => {
                    await saveCycle(cycle.key, body());
                    toast.success(`${cycle.label} salary saved`);
                  })
                }
              >
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save draft
              </Button>
              <Button
                size="lg"
                disabled={busy !== null || !valid}
                onClick={() =>
                  run("prepare", async () => {
                    await ensureSaved();
                    setDialog("finalize");
                  })
                }
              >
                <FileCheck2 /> Finalize Salary
              </Button>
            </div>
          )}
          {status === "finalized" && (
            <Button size="lg" className="w-full" onClick={() => setDialog("receive")}>
              <CheckCircle2 /> Mark as Received
            </Button>
          )}
          {status === "received" && (
            <Button size="lg" className="w-full" disabled>
              <CheckCircle2 /> Received
            </Button>
          )}
          <p className="px-1 text-xs text-muted-foreground">
            Work period {formatCyclePeriod(cycle)}, paid on {formatPayDate(cycle)}. Default salary is set in{" "}
            <Link href="/settings#salary" className="font-medium text-primary underline-offset-2 hover:underline">
              Settings
            </Link>
            .
          </p>
        </div>
      </div>

      {snapshots.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-primary" /> Saved calculations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[...snapshots].reverse().map((s, i) => (
                <SnapshotRow key={`${s.finalizedAt}-${i}`} s={s} current={!s.reopenedAt && locked} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" /> Salary history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="rounded-xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground">Saved salary months will appear here.</p>
          ) : (
            <ul className="divide-y">
              {history.map((h) => (
                <li key={h.cycleKey}>
                  <Link href={h.cycleKey === state.currentKey ? "/salary" : `/salary?cycle=${h.cycleKey}`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{h.label}</p>
                      <p className="tabular truncate text-xs text-muted-foreground">
                        OT {describeDuration(h.overtimeMinutes)}
                        {h.totalDeductionsPaise > 0 && ` · deductions ${formatINR(h.totalDeductionsPaise)}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="tabular text-sm font-semibold">{formatINR(h.finalSalaryPayablePaise)}</p>
                      <SalaryStatusBadge status={h.status} />
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {deduction && record && (
        <DeductionDialog key={deduction.n} cycleKey={cycle.key} item={deduction.item} grossPaise={record.grossSalaryPaise} otherDeductionsPaise={record.totalDeductionsPaise - (deduction.item?.amountPaise ?? 0)} today={today} onClose={() => setDeduction(null)} />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this deduction?"
        description={removing ? `${deductionLabel(removing.category)} of ${formatINR(removing.amountPaise)} will be removed and the final salary goes up by the same amount.` : ""}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          try {
            await removeDeduction(cycle.key, removing!.id);
            toast.success("Deduction removed");
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />

      {dialog === "finalize" && record && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Finalize ${cycle.label} salary?`}
          description={
            <div className="space-y-3">
              <div className="rounded-xl bg-muted p-3">
                <Line label="Basic salary" value={formatINR(record.basicSalaryPaise)} />
                <Line label="Overtime earnings" sub={describeDuration(record.overtimeMinutes)} value={`+ ${formatINR(record.overtimeEarningsPaise)}`} tone="plus" />
                <Line label="Gross salary" value={formatINR(record.grossSalaryPaise)} strong />
                {record.deductionItems.map((d) => (
                  <Line key={d.id} label={deductionLabel(d.category)} value={`− ${formatINR(d.amountPaise)}`} tone="minus" />
                ))}
                <Line label="Final salary payable" value={formatINR(record.finalSalaryPayablePaise)} strong />
              </div>
              <p>The salary and deductions will be locked. Nothing is added to your balance until you mark it as received.</p>
            </div>
          }
          confirmLabel="Finalize Salary"
          onConfirm={async () => {
            try {
              await finalizeCycle(cycle.key);
              toast.success(`${cycle.label} salary finalized`);
            } catch (err) {
              toast.error(errorMessage(err));
              throw err;
            }
          }}
        />
      )}

      {dialog === "receive" && record && (
        <ReceiveDialog
          label={cycle.label}
          amountPaise={record.finalSalaryPayablePaise}
          defaultDate={cycle.payDate <= today ? cycle.payDate : today}
          today={today}
          onClose={() => setDialog(null)}
          onConfirm={async (receivedOn) => {
            await receiveSalary(cycle.key, { receivedOn });
            toast.success(`${formatINR(record.finalSalaryPayablePaise)} added to your balance`);
          }}
        />
      )}

      {dialog === "reopen" && (
        <ReopenDialog
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await reopenCycle(cycle.key, { reason });
            toast.success("Salary reopened for editing");
          }}
        />
      )}

      <ConfirmDialog
        open={dialog === "undo"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Undo received?"
        description="The salary credit is reversed and taken out of your balance. It stays in History as reversed. The salary goes back to Finalized; reopen it if you need to change anything."
        confirmLabel="Undo received"
        destructive
        onConfirm={async () => {
          try {
            await undoReceived(cycle.key, "Undone from the Salary page");
            toast.success("Salary receipt undone");
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </div>
  );
}

function SnapshotRow({ s, current }: { s: SalarySnapshot; current: boolean }) {
  const [open, setOpen] = useState(current);
  return (
    <li className={cn("rounded-xl border p-3", !current && "bg-muted/40")}>
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{current ? "Finalized calculation" : "Earlier calculation (reopened)"}</p>
          <p className="truncate text-xs text-muted-foreground">
            Finalized {formatDateTime(s.finalizedAt)}
            {s.reopenedAt && ` · reopened ${formatDateTime(s.reopenedAt)}${s.reopenReason ? `: ${s.reopenReason}` : ""}`}
          </p>
        </div>
        <span className="tabular text-sm font-semibold">{formatINR(s.finalSalaryPayablePaise)}</span>
        <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="mt-2 border-t pt-2">
          <Line label="Basic salary" value={formatINR(s.basicSalaryPaise)} />
          <Line label="Overtime" sub={`${describeDuration(s.overtimeMinutes)} · ×${s.overtimeMultiplier}`} value={`+ ${formatINR(s.overtimeEarningsPaise)}`} />
          <Line label="Gross salary" value={formatINR(s.grossSalaryPaise)} />
          {s.deductionItems.map((d) => (
            <Line key={d.id} label={deductionLabel(d.category)} sub={d.description || undefined} value={`− ${formatINR(d.amountPaise)}`} />
          ))}
          <Line label="Final salary payable" value={formatINR(s.finalSalaryPayablePaise)} strong />
        </div>
      )}
    </li>
  );
}

function ReceiveDialog({ label, amountPaise, defaultDate, today, onClose, onConfirm }: { label: string; amountPaise: number; defaultDate: string; today: string; onClose: () => void; onConfirm: (receivedOn: string) => Promise<void> }) {
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {label} salary as received?</DialogTitle>
          <DialogDescription>Only confirm once the money is actually in your account. It is added to your balance once; doing it again never adds it twice.</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl bg-hero p-4 text-hero-foreground">
          <p className="text-xs text-hero-muted">Final salary payable</p>
          <p className="tabular text-3xl font-semibold">{formatINR(amountPaise)}</p>
        </div>
        <Field label="Date received" htmlFor="recv-date" className="mt-4">
          <Input id="recv-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="lg"
            disabled={busy || !date}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(date);
                onClose();
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Yes, I received it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen this salary for editing?</DialogTitle>
          <DialogDescription>It goes back to Draft. The current finalized calculation is kept under Saved calculations; nothing is overwritten.</DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="reopen-reason">
          <Input id="reopen-reason" maxLength={200} placeholder="e.g. late fine was wrong" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="lg"
            disabled={busy || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason);
                onClose();
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Reopen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
