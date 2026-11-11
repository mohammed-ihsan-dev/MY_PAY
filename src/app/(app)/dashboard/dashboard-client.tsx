"use client";

import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getDashboard } from "@/data/dashboard";
import { OWNER_NAME } from "@/lib/app";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageLoading } from "@/components/shared/page-loading";

export function DashboardClient() {
  const add = useSearchParams().get("add");
  const data = useLiveQuery(() => getDashboard(), []);
  if (!data) return <PageLoading />;
  return <DashboardView data={data} firstName={OWNER_NAME.split(" ")[0]} autoAdd={add === "expense" || add === "income" ? add : undefined} />;
}
