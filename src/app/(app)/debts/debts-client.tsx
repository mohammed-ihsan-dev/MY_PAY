"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { listDebts, summarizeDebts } from "@/data/debts";
import { availableBalance } from "@/data/ledger";
import { today } from "@/data/settings";
import { DebtsView } from "@/components/debts/debts-view";
import { PageLoading } from "@/components/shared/page-loading";

export function DebtsClient() {
  const data = useLiveQuery(async () => {
    const [debts, balance, t] = await Promise.all([listDebts(), availableBalance(), today()]);
    return { debts, balance, today: t };
  }, []);
  if (!data) return <PageLoading />;
  return <DebtsView debts={data.debts} overview={summarizeDebts(data.debts)} balancePaise={data.balance.balancePaise} today={data.today} />;
}
