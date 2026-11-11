"use client";

import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { isValidMonth } from "@/lib/dates";
import { getCycleState, listCycleRecords } from "@/data/cycles";
import { today } from "@/data/settings";
import { SalaryView } from "@/components/salary/salary-view";
import { PageLoading } from "@/components/shared/page-loading";

export function SalaryClient() {
  const requested = useSearchParams().get("cycle");
  const data = useLiveQuery(async () => {
    const current = await getCycleState();
    const state = requested && isValidMonth(requested) && requested < current.currentKey ? await getCycleState(requested) : current;
    return { state, history: await listCycleRecords(), today: await today() };
  }, [requested]);
  if (!data) return <PageLoading />;
  const { state } = data;
  return <SalaryView key={`${state.cycle.key}-${state.record?.status ?? "draft"}-${state.settings.updatedAt}`} state={state} history={data.history} today={data.today} />;
}
