"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, DatabaseBackup, Download, GitMerge, Loader2, Replace, RotateCcw, Share2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { backupFileName, backupStatus, exportBackup, markExported, mergeBackup, parseBackupText, previewMerge, restoreBackup, summarizeBackup, undoLastRestore, type Backup, type BackupSummary, type MergePlan } from "@/data/backup";

function saveFile(backup: Backup, prefix = "") {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = prefix + backupFileName(backup);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Saves a backup of this device as a JSON file in Downloads / Files (no upload anywhere). */
export async function downloadBackup(): Promise<void> {
  const backup = await exportBackup();
  saveFile(backup);
  await markExported(backup);
}

/** True when the phone can hand a file to its share sheet (iPhone: “Save to Files”). */
function canShareFiles(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File(["{}"], "t.json", { type: "application/json" })] });
  } catch {
    return false;
  }
}

/** Opens the phone's share sheet with the backup file, so it can be saved to Files / Drive. The file stays on the device unless the user picks a destination. */
async function shareBackup(): Promise<boolean> {
  const backup = await exportBackup();
  const file = new File([JSON.stringify(backup, null, 2)], backupFileName(backup), { type: "application/json" });
  try {
    await navigator.share({ files: [file], title: "MY PAY backup" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return false;
    throw err;
  }
  await markExported(backup);
  return true;
}

type Mode = "merge" | "replace";

function addedSummary(plan: MergePlan): string {
  const c = plan.counts;
  const parts = [
    c.cycles.added && `${c.cycles.added} salary month${c.cycles.added === 1 ? "" : "s"}`,
    c.debts.added && `${c.debts.added} debt${c.debts.added === 1 ? "" : "s"}`,
    c.payments.added && `${c.payments.added} repayment${c.payments.added === 1 ? "" : "s"}`,
    c.transactions.added && `${c.transactions.added} transaction${c.transactions.added === 1 ? "" : "s"}`,
    c.settings.added && "salary settings",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing new";
}

export function BackupCard() {
  const status = useLiveQuery(() => backupStatus(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary; plan: MergePlan; fileName: string } | null>(null);
  const [mode, setMode] = useState<Mode>("merge");
  const [replaceOk, setReplaceOk] = useState(false);
  const [repeatOk, setRepeatOk] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [shareable] = useState(canShareFiles);

  const download = async () => {
    setBusy(true);
    try {
      await downloadBackup();
      toast.success("Backup saved to Downloads. Keep a copy somewhere safe (Drive, email to yourself, a computer).");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    try {
      if (await shareBackup()) toast.success("Backup file ready");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("That file is too large to be a MY PAY backup.");
      const backup = parseBackupText(await file.text());
      const [summary, plan] = await Promise.all([summarizeBackup(backup), previewMerge(backup)]);
      setMode(summary.currentHasData ? "merge" : "replace");
      setReplaceOk(false);
      setRepeatOk(false);
      setPending({ backup, summary, plan, fileName: file.name });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const restore = async () => {
    if (!pending) return;
    setRestoring(true);
    try {
      if (mode === "merge") {
        const plan = await mergeBackup(pending.backup);
        toast.success(plan.nothingToAdd ? "Nothing new to add. Everything in the backup is already here." : `Merged: added ${addedSummary(plan)}.`);
      } else {
        // Automatic safety copy of the current data, saved as a file before anything is replaced.
        if (pending.summary.currentHasData) saveFile(await exportBackup(), "before-restore-");
        await restoreBackup(pending.backup, { allowRepeat: repeatOk });
        toast.success(pending.summary.currentHasData ? "Backup restored. A copy of the previous data was saved to Downloads." : "Backup restored");
      }
      setPending(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRestoring(false);
    }
  };

  const s = pending?.summary;
  return (
    <Card id="backup" className="scroll-mt-20">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup className="size-4 text-primary" /> Backup &amp; restore
          </CardTitle>
          <CardDescription className="mt-1">Your data lives only on this phone. A backup file is the only way to get it back if the phone or browser data is lost.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`rounded-xl p-3.5 text-sm ${status?.reminder ? "bg-warning-soft" : "bg-muted"}`}>
          {status?.lastExportAt ? (
            <p>
              Last backup: <span className="font-semibold">{formatDateTime(status.lastExportAt)}</span>
              {status.daysSinceExport !== null && status.daysSinceExport > 0 && ` (${status.daysSinceExport} day${status.daysSinceExport === 1 ? "" : "s"} ago)`}
            </p>
          ) : (
            <p className="font-medium">No backup made yet.</p>
          )}
          {status?.reminder && <p className="mt-0.5 text-xs text-warning">Time for a new backup.</p>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={download} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />} Download My Data Backup
          </Button>
          <Button size="lg" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Restore from backup…
          </Button>
          {shareable && (
            <Button size="lg" variant="outline" onClick={share} disabled={busy} className="sm:col-span-2">
              <Share2 /> Save to Files / Drive…
            </Button>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose a backup file" />
        </div>
        {status?.canUndoRestore && (
          <Button variant="ghost" size="sm" onClick={() => setUndoOpen(true)}>
            <RotateCcw /> Undo last restore{status.lastRestoreAt ? ` (${formatDateTime(status.lastRestoreAt)})` : ""}
          </Button>
        )}
      </CardContent>

      {pending && s && (
        <Dialog open onOpenChange={(o) => !o && !restoring && setPending(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Restore this backup?</DialogTitle>
              <DialogDescription className="break-all">{pending.fileName}</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-muted p-3.5 text-sm">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="text-right font-medium">{formatDateTime(s.createdAt)}</dd>
              <dt className="text-muted-foreground">Salary months</dt>
              <dd className="tabular text-right font-medium">{s.counts.cycles}</dd>
              <dt className="text-muted-foreground">Debts / repayments</dt>
              <dd className="tabular text-right font-medium">
                {s.counts.debts} / {s.counts.payments}
              </dd>
              <dt className="text-muted-foreground">Transactions</dt>
              <dd className="tabular text-right font-medium">{s.counts.transactions}</dd>
              <dt className="text-muted-foreground">Balance in backup</dt>
              <dd className="tabular text-right font-semibold">{formatINR(s.balancePaise)}</dd>
              <dt className="text-muted-foreground">Debt outstanding</dt>
              <dd className="tabular text-right font-semibold">{formatINR(s.outstandingDebtPaise)}</dd>
            </dl>
            {s.currentHasData && (
              <fieldset className="mt-3 grid gap-2" disabled={restoring}>
                <legend className="mb-2 text-sm font-semibold">How should it be restored?</legend>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${mode === "merge" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <input type="radio" name="restore-mode" value="merge" className="mt-1 size-4" checked={mode === "merge"} onChange={() => setMode("merge")} />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold"><GitMerge className="size-4" /> Merge with this phone&apos;s data</span>
                    <span className="mt-0.5 block text-muted-foreground">Adds only what is missing. Nothing on this phone is changed, and nothing is added twice.</span>
                  </span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${mode === "replace" ? "border-danger bg-danger-soft" : "border-border"}`}>
                  <input type="radio" name="restore-mode" value="replace" className="mt-1 size-4" checked={mode === "replace"} onChange={() => setMode("replace")} />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold"><Replace className="size-4" /> Full restore (replace everything)</span>
                    <span className="mt-0.5 block text-muted-foreground">This phone&apos;s data is replaced by the backup.</span>
                  </span>
                </label>
              </fieldset>
            )}
            {mode === "merge" && s.currentHasData && (
              <div className="mt-3 rounded-xl bg-muted p-3 text-sm" aria-live="polite">
                <p>
                  <span className="text-muted-foreground">Will add: </span>
                  <span className="font-semibold">{addedSummary(pending.plan)}</span>
                </p>
                {pending.plan.conflicts.length > 0 && (
                  <div className="mt-2 rounded-lg bg-warning-soft p-2.5">
                    <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-4 text-warning" /> Kept as on this phone (not overwritten):</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                      {pending.plan.conflicts.slice(0, 6).map((c) => <li key={c}>{c}</li>)}
                      {pending.plan.conflicts.length > 6 && <li>…and {pending.plan.conflicts.length - 6} more</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {mode === "replace" && s.currentHasData && (
              <label className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm">
                <input type="checkbox" className="mt-1 size-4" checked={replaceOk} onChange={(e) => setReplaceOk(e.target.checked)} />
                <span>
                  I understand all data on this phone will be <strong>replaced</strong>. A backup file of the current data is saved to Downloads first, and &ldquo;Undo last restore&rdquo; can bring it back.
                </span>
              </label>
            )}
            {mode === "replace" && s.alreadyRestoredAt && (
              <label className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm">
                <input type="checkbox" className="mt-1 size-4" checked={repeatOk} onChange={(e) => setRepeatOk(e.target.checked)} />
                <span>
                  This backup was already restored on {formatDateTime(s.alreadyRestoredAt)}. Tick to restore it again anyway (anything added since then would be replaced).
                </span>
              </label>
            )}
            <DialogFooter>
              <Button variant="outline" size="lg" onClick={() => setPending(null)} disabled={restoring}>
                Cancel
              </Button>
              {mode === "merge" ? (
                <Button size="lg" onClick={restore} disabled={restoring}>
                  {restoring && <Loader2 className="animate-spin" />} {pending.plan.nothingToAdd ? "Nothing to add" : "Merge backup"}
                </Button>
              ) : (
                <Button size="lg" variant={s.currentHasData ? "destructive" : "default"} onClick={restore} disabled={restoring || (s.currentHasData && !replaceOk) || (Boolean(s.alreadyRestoredAt) && !repeatOk)}>
                  {restoring && <Loader2 className="animate-spin" />} {s.currentHasData ? "Replace all data" : "Restore backup"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={undoOpen}
        onOpenChange={setUndoOpen}
        title="Undo the last restore?"
        description="The data that was on this phone just before the last restore comes back, replacing what is here now."
        confirmLabel="Undo restore"
        onConfirm={async () => {
          try {
            await undoLastRestore();
            toast.success("Previous data is back");
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </Card>
  );
}
