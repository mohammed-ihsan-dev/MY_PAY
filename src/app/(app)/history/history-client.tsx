"use client";

import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { isValidDateKey } from "@/lib/dates";
import { cycleByKey, cycleLastDay, shiftCycle } from "@/lib/salary-cycle";
import { ALL_CATEGORIES } from "@/lib/types";
import { listEntries } from "@/data/ledger";
import { getSettings, today } from "@/data/settings";
import { currentCycleKey } from "@/data/cycles";
import { TransactionsView, type TxFilters } from "@/components/transactions/transactions-view";
import { PageLoading } from "@/components/shared/page-loading";

export function HistoryClient() {
  const sp = useSearchParams();
  const period = (["cycle", "last", "all", "custom"] as const).find((p) => p === sp.get("period")) ?? "cycle";
  const rawDir = sp.get("dir");
  const dir = rawDir === "in" || rawDir === "out" ? rawDir : undefined;
  const rawCat = sp.get("cat") ?? "";
  const cat = ALL_CATEGORIES.some((c) => c.value === rawCat) ? rawCat : undefined;
  const showReversed = sp.get("rev") === "1";
  const qFrom = sp.get("from") ?? "";
  const qTo = sp.get("to") ?? "";

  const data = useLiveQuery(async () => {
    const settings = await getSettings();
    let from: string | undefined;
    let to: string | undefined; // inclusive
    if (period === "cycle" || period === "last") {
      const current = currentCycleKey(settings);
      const c = cycleByKey(period === "cycle" ? current : shiftCycle(current, -1), settings.paydayDay);
      from = c.startDate;
      to = cycleLastDay(c);
    } else if (period === "custom") {
      from = isValidDateKey(qFrom) ? qFrom : undefined;
      to = isValidDateKey(qTo) ? qTo : undefined;
    }
    const entries = await listEntries({ from, to, direction: dir, category: cat, showReversed });
    const filters: TxFilters = { period, from: from ?? "", to: to ?? "", dir: dir ?? "all", cat: cat ?? "", rev: showReversed };
    return { entries, filters, today: await today() };
  }, [period, dir, cat, showReversed, qFrom, qTo]);

  if (!data) return <PageLoading />;
  return <TransactionsView entries={data.entries} filters={data.filters} today={data.today} />;
}
