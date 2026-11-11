"use client";

import { useState } from "react";
import Link from "next/link";
import { DatabaseBackup, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import type { BackupStatus } from "@/data/backup";
import { downloadBackup } from "./backup-card";

/** Dashboard nudge when there is data but no recent backup. */
export function BackupReminder({ status }: { status: BackupStatus }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-cream p-4 sm:flex-row sm:items-center">
      <DatabaseBackup className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{status.lastExportAt ? `Last backup ${status.daysSinceExport} days ago` : "No backup yet"}</p>
        <p className="text-xs text-muted-foreground">
          Your data is only on this phone. Save a backup file to keep it safe.{" "}
          <Link href="/settings#backup" className="font-medium text-primary underline-offset-2 hover:underline">
            Backup settings
          </Link>
        </p>
      </div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await downloadBackup();
            toast.success("Backup downloaded");
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="animate-spin" />} Download backup
      </Button>
    </div>
  );
}
