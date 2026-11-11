"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { blankEntry, EntryDialog, type EntryType } from "./entry-dialog";

/** "Add expense" / "Add income" buttons that open the entry sheet. */
export function QuickAdd({ today, className, compact = false, autoOpen }: { today: string; className?: string; compact?: boolean; autoOpen?: EntryType }) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [type, setType] = useState<EntryType>(autoOpen ?? "expense");
  const [n, setN] = useState(0);
  const start = (t: EntryType) => {
    setType(t);
    setN((x) => x + 1);
    setOpen(true);
  };
  return (
    <>
      <div className={cn("grid grid-cols-2 gap-2", className)}>
        <Button size={compact ? "default" : "lg"} onClick={() => start("expense")}>
          <Minus /> Add expense
        </Button>
        <Button size={compact ? "default" : "lg"} variant="outline" onClick={() => start("income")}>
          <Plus /> Add income
        </Button>
      </div>
      <EntryDialog key={n} open={open} onOpenChange={setOpen} initial={blankEntry(type, today)} today={today} />
    </>
  );
}
